import { chromium, Page, Browser } from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

dotenv.config();

// ============================================================
// CONFIG & INTERFACES
// ============================================================

const EVENT_URL =
  "https://www.loket.com/event/dwp-2026_wVb9?utm_source=eventseruuntukmu&utm_medium=website&utm_content=enterprise&utm_campaign=2857lkt12dwp2026";

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identityId: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  gender: string;
  ticketCategory?: string;
  ticketQuantity?: string;
  methodPayment?: string;
  jenisVA?: string; // e.g. "Virtual Account BCA", "Virtual Account Mandiri", dll.
  receiveWaNotif?: boolean;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function screenshot(page: Page, name: string) {
  try {
    const dir = "./screenshots";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${name}`, fullPage: true });
    console.log(`📸 Screenshot tersimpan: ${dir}/${name}`);
  } catch {
    console.log("⚠️ Gagal mengambil screenshot.");
  }
}

async function waitShort(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function validateUser(user: UserData, userId: string) {
  const required = [
    ["FIRST_NAME", user.firstName],
    ["LAST_NAME", user.lastName],
    ["EMAIL", user.email],
    ["PHONE", user.phone],
    ["IDENTITY_ID", user.identityId],
    ["DOB_DAY", user.dobDay],
    ["DOB_MONTH", user.dobMonth],
    ["DOB_YEAR", user.dobYear],
    ["DOB_YEAR", user.dobYear],
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`[${userId}] Data user di users.json belum lengkap: ${missing.join(", ")}`);
  }
}

function savePaymentResult(data: any) {
  const filePath = "./results.json";
  let currentResults: any[] = [];

  if (fs.existsSync(filePath)) {
    try {
      currentResults = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      currentResults = [];
    }
  }

  currentResults.push(data);
  fs.writeFileSync(filePath, JSON.stringify(currentResults, null, 2));
}

async function injectAntiCookieCSS(page: Page) {
  await page
    .addStyleTag({
      content: `
      .cky-consent-container, 
      .cky-overlay, 
      .cky-modal,
      [data-cky-tag="notice-wrapper"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
    })
    .catch(() => {});
}

// WAITING & POLLING UNTUK TIKET DIBUKA (WAR MODE)
async function waitForSaleToStart(page: Page, userId: string) {
  console.log(`[${userId}] ⏳ Menunggu tiket dibuka / tombol 'Beli Tiket' aktif...`);

  let attempts = 0;
  while (true) {
    attempts++;
    
    // Cari tombol Beli Tiket
    const buyButton = page.locator("button").filter({ hasText: /Beli Tiket/i }).first();

    // Jika tombol sudah muncul dan terlihat, klik langsung!
    if (await buyButton.isVisible().catch(() => false)) {
      console.log(`[${userId}] 🚨 TIKET DIBUKA! Langsung klik Beli Tiket!`);
      await buyButton.click({ force: true });
      break;
    }

    // Refresh cepat halaman jika belum muncul
    if (attempts % 3 === 0) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }

    // Delay polling sangat tipis (200ms) agar tidak membebankan CPU/network
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Auto-handling Turnstile Captcha jika muncul setelah klik
  try {
    const captchaFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"], iframe[title*="Cloudflare"]');
    const checkbox = captchaFrame.locator('input[type="checkbox"], .mark, #challenge-stage');
    if (await checkbox.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await checkbox.click({ force: true });
      console.log(`[${userId}] ⚡ CAPTCHA Turnstile otomatis diklik.`);
    }
  } catch {}
}
async function selectLanguageEN(page: Page, userId: string) {
  console.log(`[${userId}] 🌐 Mengubah bahasa ke GB EN...`);

  const success = await page.evaluate(() => {
    // 1. Ambil container dropdown dan hapus class 'hidden'
    const dropdownMenu = document.querySelector('#lang-dd');
    if (dropdownMenu) {
      dropdownMenu.classList.remove('hidden');
    }

    // 2. Cari elemen opsi GB EN (id="0" atau teks "GB EN")
    const enOption = (document.querySelector('a[id="0"]') ||
      Array.from(document.querySelectorAll('a[role="langmenuitem"]')).find(
        (el) => el.textContent?.includes('GB EN')
      )) as HTMLElement;

    if (enOption) {
      // Dispatch event lengkap agar event listener framework (Vue/React/Alpine) merespons
      const opts = { bubbles: true, cancelable: true, view: window };
      enOption.dispatchEvent(new MouseEvent('mousedown', opts));
      enOption.dispatchEvent(new MouseEvent('mouseup', opts));
      enOption.click();
      return true;
    }
    return false;
  });

  if (success) {
    console.log(`[${userId}] ✅ Bahasa berhasil diubah ke GB EN.`);
  } else {
    console.log(`[${userId}] ⚠️ Opsi GB EN tidak ditemukan di DOM.`);
  }

  await page.waitForTimeout(500); // Jeda singkat untuk re-render teks UI
}

// ============================================================
// AUTOMATION STEPS
// ============================================================


// 1. OPEN EVENT
async function openEvent(page: Page, userId: string) {
  console.log(`[${userId}] 🌐 Membuka event...`);
  await page.goto(EVENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  console.log(`[${userId}] ✅ Event terbuka.`);
}

// 3. SELECT FIRST AVAILABLE TICKET (RETURNING CATEGORY NAME)
async function selectFirstAvailableTicket(page: Page, userId: string, quantity = "1"): Promise<string> {
  console.log(`[${userId}] 🔎 Mencari kategori paling atas yang masih tersedia...`);

  let selectedCategoryName = "-";
  let isSelected = false;

  // Tunggu container tiket dimuat
  await page.locator('.ticket-item').first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

  // Dapatkan seluruh card tiket yang tidak disabled / sold out
  const availableCards = page.locator('.ticket-item:not(.disabled)');
  const totalAvailable = await availableCards.count();

  if (totalAvailable === 0) {
    throw new Error(`[${userId}] ❌ Semua kategori tiket HABIS / SOLD OUT!`);
  }

  for (let i = 0; i < totalAvailable; i++) {
    const card = availableCards.nth(i);

    // Ambil nama kategori (h6, h3, atau elemen judul)
    const catTitle = await card
      .locator('h6, h3, div.font-medium, p.font-bold, span')
      .first()
      .innerText()
      .catch(() => `Kategori Ke-${i + 1}`);

    const selectElem = card.locator('select.ticket-types, select').first();

    if (await selectElem.isVisible().catch(() => false)) {
      selectedCategoryName = catTitle.trim();
      console.log(`[${userId}] 🎯 Memilih kategori paling atas: "${selectedCategoryName}"`);

      try {
        await selectElem.selectOption(quantity, { force: true });
        console.log(`[${userId}] ✅ Berhasil mengubah kuantitas ke "${quantity}" via Playwright selectOption.`);
        isSelected = true;
        break;
      } catch {
        console.log(`[${userId}] ⚠️ Playwright selectOption terhalang, mencoba Fallback DOM...`);
      }
    }
  }

  // Fallback Injeksi DOM jika Playwright Locator terhalang
  if (!isSelected) {
    const domResult = await page.evaluate((qty) => {
      const activeCard = document.querySelector('.ticket-item:not(.disabled)');
      if (!activeCard) return { success: false, catName: '-' };

      const select = activeCard.querySelector('select') as HTMLSelectElement | null;
      const hEl = activeCard.querySelector('h6, h3, div, span');
      const catName = hEl ? hEl.textContent?.trim() : 'Kategori Tersedia';

      if (select) {
        select.value = qty;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
        return { success: true, catName };
      }
      return { success: false, catName: '-' };
    }, quantity);

    if (domResult.success) {
      isSelected = true;
      selectedCategoryName = domResult.catName || 'Tersedia Pertama';
      console.log(`[${userId}] ✅ (DOM Fallback) Berhasil memilih kuantitas "${quantity}" pada "${selectedCategoryName}".`);
    }
  }

  if (!isSelected) {
    throw new Error(`[${userId}] Gagal memilih opsi kuantitas tiket.`);
  }

  return selectedCategoryName;
}

// 4. CLICK ORDER NOW
async function clickOrderNow(page: Page, userId: string) {
  console.log(`[${userId}] ➡️ Menyiapkan Order Now...`);
  const orderButton = page.getByRole('button', { name: 'Order Now' });
  await orderButton.click();

  const firstNameInput = page.locator('input[name="firstname"], input#firstname').first();
  await firstNameInput.waitFor({ state: "visible", timeout: 15_000 });
  console.log(`[${userId}] ✅ Personal Information terbuka.`);
}

// 5. FILL PERSONAL INFORMATION (ANTI TIMEOUT DOB)
async function fillPersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] 📝 Mengisi Personal Information...`);

  // First Name
  const firstName = page.locator('input[name="firstname"], input#firstname').first();
  if ((await firstName.count()) > 0) await firstName.fill(user.firstName);

  // Last Name
  const lastName = page.locator('input[name="lastname"], input#lastname').first();
  if ((await lastName.count()) > 0) await lastName.fill(user.lastName);

  // Email
  const email = page.locator('input[name="email"], input#email').first();
  if ((await email.count()) > 0) await email.fill(user.email);

  // Phone
  const phone = page.locator('input[name="telephone"], input#telephone').first();
  if ((await phone.count()) > 0) await phone.fill(user.phone);

  // Identity ID
  const identity = page.locator('input[name="identity_id"], input#identity_id').first();
  if ((await identity.count()) > 0) await identity.fill(user.identityId);

  // --- DOB DAY ---
  const dobDaySelect = page.locator('select[name="dob_day"]').first();
  if ((await dobDaySelect.count()) > 0) {
    const rawDay = parseInt(user.dobDay, 10).toString();
    const paddedDay = rawDay.padStart(2, "0");
    await dobDaySelect.selectOption([rawDay, paddedDay]).catch(() => {});
  }

  // --- DOB MONTH (HANDLING ANTI-TIMEOUT) ---
  const dobMonthSelect = page.locator('select[name="dob_month"]').first();
  if ((await dobMonthSelect.count()) > 0) {
    const monthNum = parseInt(user.dobMonth, 10);
    const rawMonth = isNaN(monthNum) ? user.dobMonth : monthNum.toString();
    const paddedMonth = isNaN(monthNum) ? user.dobMonth : monthNum.toString().padStart(2, "0");

    const monthsName = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const monthLabel = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthsName[monthNum - 1] : "";

    try {
      await dobMonthSelect.selectOption([rawMonth, paddedMonth]);
    } catch {
      if (monthLabel) {
        await dobMonthSelect.selectOption({ label: monthLabel }).catch(() => {});
      }
    }
  }

  // --- DOB YEAR ---
  const dobYearSelect = page.locator('select[name="dob_year"]').first();
  if ((await dobYearSelect.count()) > 0) {
    await dobYearSelect.selectOption(user.dobYear).catch(() => {});
  }

  console.log(`[${userId}] ✅ Data personal terisi.`);
}

// 6. SELECT GENDER & AGREEMENTS
async function completePersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] 📝 Menyelesaikan Personal Information...`);

  const maleRadio = page.locator("#gender_1");
  await maleRadio.waitFor({ state: "visible", timeout: 10_000 });

  if (!(await maleRadio.isChecked())) {
    await maleRadio.check({ force: true });
  }

  // Option whatsapp notification
  const wantNotif = user.receiveWaNotif ?? true; 
  const targetId = wantNotif ? "#receive_yes" : "#receive_no";

  console.log(`[${userId}] 📲 Memilih notifikasi WhatsApp: ${wantNotif ? "Yes" : "No"}...`);

  const waRadio = page.locator(targetId);

  if (await waRadio.count() > 0) {
    await waRadio.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    
    if (!(await waRadio.isChecked().catch(() => false))) {
      await waRadio.check({ force: true });
    }
    console.log(`[${userId}] ✅ Radio button notifikasi WA (${wantNotif ? "Yes" : "No"}) berhasil dipilih.`);
  }

  // Checkbox Terms
  const termsCheckbox = page.locator('#accept_toc');
  await termsCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await termsCheckbox.check();

  // Checkbox Privacy
  const privacyCheckbox = page.locator('#accept_consent');
  await privacyCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await privacyCheckbox.check();

  await waitShort(500);

  const nextButton = page.locator("#btn-register");
  await nextButton.waitFor({ state: "visible", timeout: 10_000 });

  if (await nextButton.isDisabled()) {
    await screenshot(page, `error-personal-info-${userId}.png`);
    throw new Error(`[${userId}] Next masih disabled. Mohon periksa kelengkapan form.`);
  }

  await nextButton.click();
  console.log(`[${userId}] ✅ Next berhasil diklik.`);
  await page.waitForTimeout(1_000);
}

// 7. WAIT PAYMENT TAB
async function waitForPayment(page: Page, userId: string) {
  console.log(`[${userId}] 🏦 Menunggu payment tab...`);
  const paymentTab = page.getByRole('tablist', { name: 'Payment type' }).getByText('Pay Now');
  await paymentTab.click();
  console.log(`[${userId}] ✅ Payment tab ditemukan.`);
}

// 8. SELECT VIRTUAL ACCOUNT SECTION (DIREKT & AMAN)
async function selectVirtualAccount(page: Page, userId: string) {
  console.log(`[${userId}] 🏦 Membuka Virtual Account...`);

  // 1. Coba klik via Playwright Locator
  const vaTextLocator = page.getByText("Virtual Account", { exact: true }).first();

  try {
    await vaTextLocator.waitFor({ state: "visible", timeout: 8_000 });
    await vaTextLocator.scrollIntoViewIfNeeded().catch(() => {});
    await vaTextLocator.click({ force: true });
    console.log(`[${userId}] ✅ Text 'Virtual Account' berhasil diklik.`);
  } catch {
    console.log(`[${userId}] ⚠️️ Playwright click terhalang, mengeksekusi Native DOM Event...`);

    // 2. Fallback: Injeksi Event Klik Langsung ke Node DOM
    const clicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll("*"));
      const target = allElements.find((el) => el.textContent?.trim() === "Virtual Account");

      if (target) {
        // Cari container terdekat yang memiliki event handler / pointer
        const container =
          target.closest('div[class*="card"], div[class*="accordion"], div[class*="item"], div, button') || target;

        const opts = { bubbles: true, cancelable: true, view: window };
        container.dispatchEvent(new PointerEvent("pointerdown", opts));
        container.dispatchEvent(new MouseEvent("mousedown", opts));
        container.dispatchEvent(new PointerEvent("pointerup", opts));
        container.dispatchEvent(new MouseEvent("mouseup", opts));
        (container as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error(`[${userId}] Gagal menemukan atau mengeklik elemen Virtual Account.`);
    }
  }

  // Beri jeda sangat singkat untuk re-render daftar bank (BCA, Mandiri, dll)
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// 9. SELECT BCA
// 9. SELECT VIRTUAL ACCOUNT DINAMIS BERDASARKAN users.json
async function selectVA(page: Page, user: UserData, userId: string) {
  const targetVA = user.jenisVA || "Virtual Account BCA"; // Fallback ke BCA jika tidak diisi
  console.log(`[${userId}] 🔘 Memilih ${targetVA}...`);

  const vaOption = page.getByText(targetVA, { exact: true }).first();

  await vaOption.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await vaOption.click();
  console.log(`[${userId}] ✅ ${targetVA} berhasil diklik`);
}

// 10. CONFIRM VIRTUAL ACCOUNT DINAMIS
// 10. CONFIRM VIRTUAL ACCOUNT DINAMIS (INSTANT / NON-BLOCKING)
async function confirmVA(page: Page, user: UserData, userId: string) {
  const targetVA = user.jenisVA || "Virtual Account BCA";
  console.log(`[${userId}] ⏳ Mengecek confirmation dialog untuk ${targetVA}...`);

  // Target modal dialog konfirmasi secara langsung
  const confirmModal = page
    .locator('div[role="dialog"], div[class*="modal"]')
    .filter({ hasText: /Confirmation|You are choosing/i })
    .first();

  // Cek keberadaan tanpa membuat Playwright menunggu lama jika modal tidak ada
  if (await confirmModal.isVisible({ timeout: 500 }).catch(() => false)) {
    console.log(`[${userId}] ⚠️ Confirmation dialog ${targetVA} muncul.`);

    const okButton = confirmModal
      .locator("button")
      .filter({ hasText: /^OK$/i })
      .first();

    if (await okButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await okButton.click({ force: true });
      console.log(`[${userId}] ✅ Confirmation ${targetVA} selesai.`);
    }
  } else {
    console.log(`[${userId}] ℹ️ Confirmation dialog tidak muncul.`);
  }
}

// 11. WAIT CHECKOUT (NATIVE DOM INJECTION - ANTI TIMEOUT)
async function waitForCheckout(page: Page, userId: string) {
  console.log(`[${userId}] ⏳ Menyiapkan konfirmasi checkout...`);

  // Jeda 800ms agar backend Loket selesai mendaftarkan pilihan VA
  await new Promise((resolve) => setTimeout(resolve, 800));

  const btnNext = page.locator("button").filter({ hasText: /Next/i }).first();
  await btnNext.click({ force:true });

  // Handle modal konfirmasi sekunder "OK" jika muncul
  const confirmMethodBtn = page.getByRole('button', { name: 'OK', exact: true }).first();
  if (await confirmMethodBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await confirmMethodBtn.click({ force: true });
  }

  // Tombol akhir "Pay Now"
  const lastConfirmPaymentButton = page.locator('button').filter({ hasText: /Pay Now|Bayar Sekarang/i }).first();
  await lastConfirmPaymentButton.click({ force: true });
}

// 12. EXTRACT INVOICE DETAILS & CETAK DI AKHIR
async function extractAndLogInvoice(
  page: Page,
  user: UserData,
  userId: string,
  categoryName: string,
  startTime: number
) {
  console.log(`[${userId}] ⏳ Extracting Invoice Data...`);

  const invoiceIndicator = page.locator('body').filter({
    hasText: /Invoice Code|Virtual Account|Payment deadline/i,
  });
  await invoiceIndicator.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const allTexts = await page
    .locator("span, div, p, h1, h2, h3, h4, h5, h6")
    .allInnerTexts()
    .catch(() => []);
  const cleanedTexts = allTexts.map((t) => t.trim()).filter(Boolean);

  // 1. INVOICE CODE
  let invoiceCode = "-";
  const invCodeLocator = page
    .locator("div, section")
    .filter({ has: page.locator("div, span, p", { hasText: /^Invoice Code$/i }) })
    .locator("span, div, p")
    .last();

  if (await invCodeLocator.isVisible().catch(() => false)) {
    const text = (await invCodeLocator.innerText()).trim();
    if (text && !/invoice/i.test(text)) invoiceCode = text;
  }

  if (invoiceCode === "-") {
    const matchedCode = cleanedTexts.find(
      (text) =>
        /^[A-Z0-9]{6,10}$/.test(text) &&
        !["PENDING", "PAID", "EXPIRED", "SUCCESS", "VIRTUAL", "ACCOUNT", "BCA"].includes(text.toUpperCase())
    );
    if (matchedCode) invoiceCode = matchedCode;
  }

  // 2. VA NUMBER
  let vaNumber = "-";
  const matchedVA = cleanedTexts.find((text) => /^\d{10,30}$/.test(text));
  if (matchedVA) {
    vaNumber = matchedVA;
  } else {
    const regexVaMatch = bodyText.match(/\b\d{10,30}\b/);
    if (regexVaMatch) vaNumber = regexVaMatch[0];
  }

  // 3. TOTAL PAYMENT
  let totalPayment = "-";
  const totalPaymentLocator = page
    .locator("div, section")
    .filter({ has: page.locator("div, span, p", { hasText: /^Total Payment$/i }) })
    .locator("span, div, p")
    .last();

  if (await totalPaymentLocator.isVisible().catch(() => false)) {
    totalPayment = (await totalPaymentLocator.innerText()).trim();
  } else {
    const matchedTotal = cleanedTexts.find((text) => /^Rp\.?\s*[\d\.]+/i.test(text));
    if (matchedTotal) totalPayment = matchedTotal;
  }

  // 4. PAYMENT DEADLINE
  let paymentDeadline = "-";
  const deadlineMatch = bodyText.match(/Payment deadline:\s*([^\n\r]+)/i);
  if (deadlineMatch && deadlineMatch[1]) {
    paymentDeadline = deadlineMatch[1].replace(/If you pass.*/i, "").trim();
  }

  // 5. METHOD PAYMENT
  let methodPayment = user.jenisVA || "Virtual Account BCA"; // Default ke data users.json
  // Target langsung tag <h5> atau container .payment-card
  const vaTitleLocator = page
    .locator('div.payment-card h5, .payment-card h5, h5.font-medium')
    .first();

  if (await vaTitleLocator.isVisible().catch(() => false)) {
    const extractedText = (await vaTitleLocator.innerText()).trim();
    if (extractedText && !/time left|payment deadline/i.test(extractedText)) {
      methodPayment = extractedText;
    }
  } else {
    // Fallback: Cari elemen H5 / DIV yang secara spesifik berisi kata "Virtual Account"
    const fallbackLocator = page.locator('h5, div').filter({ hasText: /^Virtual Account/i }).first();
    if (await fallbackLocator.isVisible().catch(() => false)) {
      const text = (await fallbackLocator.innerText()).trim();
      if (text) methodPayment = text.split('\n')[0];
    }
  }

  const endTime = performance.now();
  const executionTime = ((endTime - startTime) / 1000).toFixed(2);

  console.log("\n==================================================");
  console.log(`👤 Nama Pemesan     : ${user.firstName} ${user.lastName}`);
  console.log(`🎫 Kategori Tiket   : ${categoryName}`);
  console.log(`🏦 Metode Pembayaran : ${methodPayment}`);
  console.log(`📄 Invoice Code     : ${invoiceCode}`);
  console.log(`💳 No. VA           : ${vaNumber}`);
  console.log(`💰 Total Pembayaran : ${totalPayment}`);
  console.log(`⏰ Batas Pembayaran : ${paymentDeadline}`);
  console.log(`⚡ Waktu Eksekusi   : ${executionTime} detik`);
  console.log("==================================================\n");

  savePaymentResult({
    userId,
    fullName: `${user.firstName} ${user.lastName}`,
    category: categoryName,
    invoiceCode,
    vaNumber,
    totalPayment,
    paymentDeadline,
    timestamp: new Date().toISOString(),
  });

  await screenshot(page, `invoice-${userId}-${Date.now()}.png`);
}

// ============================================================
// SINGLE WORKER TASK EXECUTION
// ============================================================

async function processUserTask(browser: Browser, user: UserData, index: number) {
  const userId = `USER-${index + 1} (${user.firstName})`;
  const startTime = performance.now();

  // Staggering launch (Jeda antartab 1.5 detik)
  const delayTime = index * 1500;
  if (delayTime > 0) {
    console.log(`[${userId}] ⏳ Menunggu ${delayTime / 1000} detik sebelum meluncur...`);
    await new Promise((resolve) => setTimeout(resolve, delayTime));
  }

  validateUser(user, userId);

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();
// ✅ HANYA BLOKIR GAMBAR, MEDIA, FONT (CSS TETAP ALLOWED)
await page.route("**/*.{png,jpg,jpeg,svg,webp,woff,woff2}", (route) => route.abort());
await page.route("**/*{analytics,google-analytics,facebook,pixel,hotjar}*", (route) => route.abort());

  page.on("domcontentloaded", async () => {
    await injectAntiCookieCSS(page);
  });

  try {
    await openEvent(page, userId);
    // 2. POLLING STANDBY (Bot akan berputar di sini sampai jam WAR/tombol aktif)
    await waitForSaleToStart(page, userId);

    await selectLanguageEN(page, userId);
    // Menampung nama kategori yang berhasil dipilih
    const categorySelected = await selectFirstAvailableTicket(page, userId, "1");

    await clickOrderNow(page, userId);
    await fillPersonalInformation(page, user, userId);
    await completePersonalInformation(page, user, userId);
    await waitForPayment(page, userId);
    await selectVirtualAccount(page, userId);
    await selectVA(page, user, userId);
    await confirmVA(page, user, userId);
    await waitForCheckout(page, userId);

    // Mencetak dan menyimpan data invoice di akhir alur
    await extractAndLogInvoice(page, user, userId, categorySelected, startTime);

    console.log(`\n🎉 [${userId}] PROSES OTOMATIS SELESAI. Silakan selesaikan pembayaran!\n`);
  } catch (error) {
    console.error(`❌ [${userId}] TERJADI ERROR:`, error);
    await screenshot(page, `error-${userId}-${Date.now()}.png`);
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("    LOKET DWP 2026 BOT (PARALLEL MODE)    ");
  console.log("==========================================");
  console.log("");

  const jsonPath = path.join(__dirname, "users.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ File users.json tidak ditemukan! Silakan buat file users.json terlebih dahulu.");
    return;
  }

  const usersList: UserData[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📋 Memuat ${usersList.length} data pengguna dari users.json.\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--incognito"],
  });

  // Menjalankan semua worker paralel
  const tasks = usersList.map((user, index) => processUserTask(browser, user, index));
  await Promise.all(tasks);

  console.log("⚠️ Semua proses antrean bot telah selesai. Browser tetap terbuka untuk pembayaran manual.");
}

main();
