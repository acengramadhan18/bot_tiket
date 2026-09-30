import { chromium, Page, Browser } from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables dari .env2
dotenv.config({ path: ".env2" });

// ============================================================
// CONFIG & TYPES
// ============================================================

const EVENT_URL = "https://bigbanginjakarta.com/#tickets";

interface UserData {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  identityId: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  gender: string; // "1" untuk Male, "2" untuk Female
  vipCode?: string; // Kode VIP / Access Code jika diperlukan
  ticketQuantity?: string;
  methodPayment?: string;
  va?: string;
  [key: string]: any;
}

interface PaymentResult {
  userId: string | number;
  fullName: string;
  vaNumber: string;
  amount: string;
  bookingCode: string;
  methodPayment: String;
  ticketQuantity?: string;
  paymentDeadline: String;
  timestamp: string;
}

// ============================================================
// HELPER & UTILITIES
// ============================================================

async function screenshot(page: Page, name: string) {
  try {
    ensureDirectoryExistence(name);
    await page.screenshot({ path: name, fullPage: true });
    console.log(`📸 Screenshot: ${name}`);
  } catch {
    console.log("⚠️ Gagal mengambil screenshot.");
  }
}

async function waitShort(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function savePaymentResult(data: PaymentResult) {
  const filePath = "./results.json";
  let currentResults: PaymentResult[] = [];

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

// INJEKSI CSS GLOBAL: SEMBUNYIKAN POPUP COOKIE DI MANAPUN
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

// ============================================================
// WORKFLOW AUTOMATION (PER USER)
// ============================================================

// 1. OPEN EVENT
async function openEvent(page: Page, userId: string) {
  console.log(`[${userId}] 🌐 Membuka event...`);
  await page.goto(EVENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  console.log(`[${userId}] ✅ Event terbuka.`);
}

// 1.5 LOGIKA VIP CODE & ANTREAN QUEUE (ADAPTASI PYTHON)
async function handleQueueAndAccess(page: Page, vipCode: string, userId: string) {
  const ticketButtonSelector = "button.lp-button.full:has-text('Buy Ticket'), button:has-text('Buy Ticket')";
  const accessInputSelector = "input[placeholder*='code']";
  const queueButtonSelector = "button:has-text('Join Queue')";

  console.log(`[${userId}] 🔎 Memantau tombol 'Buy Ticket' aktif...`);
  
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      const button = page.locator(ticketButtonSelector).first();
      // Menggunakan isDisabled() khas TypeScript Playwright
      if ((await button.count()) > 0 && !(await button.isDisabled())) {
        console.log(`\n[${userId}] 💥 TOMBOL WAR AKTIF! Mengeklik tombol utama...`);
        await button.click({ force: true });
        break;
      }
    } catch {
      process.stdout.write(`\r[${userId}] [Monitoring] Mencari tombol aktif... Percobaan ke-${attempts}`);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(100);
    }
  }

  // Cek apakah halaman membutuhkan Kode Akses VIP / Antrean Queue
  const isAccessPage = await page.locator(accessInputSelector).isVisible({ timeout: 3_000 }).catch(() => false);

  if (isAccessPage && vipCode) {
    console.log(`\n[${userId}] 🔑 Memasuki halaman validasi akses...`);
    await page.locator(accessInputSelector).fill(vipCode);

    console.log(`[${userId}] ⏳ Menunggu tombol 'Join Queue' aktif...`);
    while (true) {
      const queueButton = page.locator(queueButtonSelector);
      // Menggunakan isDisabled() khas TypeScript Playwright
      if ((await queueButton.count()) > 0 && !(await queueButton.isDisabled())) {
        console.log(`[${userId}] 💥 Verifikasi Lolos! Menekan 'Join Queue'...`);
        await queueButton.click({ force: true });
        break;
      }
      await page.waitForTimeout(100);
    }
    console.log(`[${userId}] 🎯 Resmi masuk antrean. Menunggu halaman tiket terbuka...`);
  }
}

// 3. FIND FIRST AVAILABLE TICKET & PICK QUANTITY (ANTI-ERROR SOLD OUT)
async function selectFirstAvailableTicket(page: Page, quantity: string, userId: string) {
  console.log(`[${userId}] 🔎 Mencari tombol 'Pilih' pada kategori tiket yang tersedia...`);

  const pilihButtons = page.locator('button, div[role="button"], a[role="button"]').filter({
    hasText: /^pilih$/i,
  });

  let clicked = false;

  try {
    const count = await pilihButtons.count();
    
    for (let i = 0; i < count; i++) {
      const btn = pilihButtons.nth(i);
      
      const isSoldOut = await btn.evaluate((el) => {
        const card = el.closest('div, section, article') || el.parentElement;
        return card ? /habis dijual|habis terjual|sold out/i.test(card.textContent || '') : false;
      }).catch(() => false);

      if (!isSoldOut && (await btn.isVisible().catch(() => false))) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true });
        console.log(`[${userId}] 🖱️ Membuka dropdown pilihan tiket (Kategori Ke-${i + 1})...`);
        clicked = true;
        break;
      }
    }
  } catch {
    console.log(`[${userId}] ⚠️ Playwright selector gagal, mengeksekusi Fallback DOM...`);
  }

  if (!clicked) {
    clicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, div, span, a'));
      const target = elements.find((el) => {
        const text = el.textContent?.trim() || '';
        const isPilihText = /^pilih$/i.test(text);
        const card = el.closest('div, section') || el.parentElement;
        const isSoldOut = card ? /habis dijual|habis terjual|sold out/i.test(card.textContent || '') : false;
        return isPilihText && !isSoldOut;
      });

      if (target) {
        (target as HTMLElement).click();
        return true;
      }
      return false;
    });
  }

  if (!clicked) {
    throw new Error(`[${userId}] Tidak menemukan kategori tiket yang tersedia (Semua Habis/Sold Out).`);
  }

  await pickQuantity(page, quantity, userId);
}

async function pickQuantity(page: Page, quantity = "1", userId: string) {
  console.log(`[${userId}] 🔢 Memilih jumlah tiket (${quantity})...`);

  const optionLocator = page
    .locator('[role="option"], [role="menuitem"], div, button, li, span')
    .filter({ hasText: new RegExp(`^\\s*${quantity}\\s*$`) })
    .last();

  try {
    await optionLocator.waitFor({ state: "visible", timeout: 4_000 });
    await optionLocator.click({ force: true });
    console.log(`[${userId}] ✅ Berhasil memilih ${quantity} tiket.`);
    return;
  } catch {
    console.log(`[${userId}] ⚠️ Playwright Locator gagal, mengeksekusi Fallback Injeksi DOM...`);
  }

  const selectedViaDOM = await page.evaluate((qty) => {
    const elements = Array.from(
      document.querySelectorAll('div, button, li, span, [role="option"]')
    );
    const target = elements.reverse().find((el) => el.textContent?.trim() === qty);

    if (target) {
      (target as HTMLElement).click();
      return true;
    }
    return false;
  }, quantity);

  if (selectedViaDOM) {
    console.log(`[${userId}] ✅ (DOM) Berhasil memilih ${quantity} tiket.`);
  } else {
    throw new Error(`Gagal menemukan opsi pilihan quantity '${quantity}' di halaman.`);
  }
}

// 4. PESAN TIKET & SYARAT KETENTUAN
async function pesanSekarang(page: Page, userId: string) {
  console.log(`[${userId}] ➡️ Siap Order...`);
  const btnPesan = page.locator("button").filter({ hasText: /Pesan Sekarang/i }).first();

  await btnPesan.waitFor({ state: "visible", timeout: 5_000 });
  await btnPesan.click({ force: true });
}

async function syaratKetentuan(page: Page, userId: string) {
  console.log(`[${userId}] 📜 Scroll syarat ketentuan...`);
  const scrollBottomBtn = page.getByRole("button", { name: "Scroll to bottom" });
  if (await scrollBottomBtn.isVisible().catch(() => false)) {
    await scrollBottomBtn.click({ force: true });
  } else {
    // Fallback Scroll modal
    await page.evaluate(() => {
      const box = document.querySelector("div.modal-body, .modal-content, [class*='modal']");
      if (box) box.scrollTop = box.scrollHeight;
    });
  }

  const btnSetuju = page.getByRole("button", { name: "Ya", exact: true });
  await btnSetuju.waitFor({ state: "visible", timeout: 3_000 });
  await btnSetuju.click({ force: true });
  console.log(`[${userId}] ✅ Tombol "Ya" Syarat & Ketentuan berhasil diklik.`);

  await page.locator('div[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

async function fillDateOfBirth(page: Page, user: UserData, userId: string) {
  const dobTrigger = page.locator("button").filter({ hasText: /Pilih Tanggal Lahir/i }).first();

  try {
    await dobTrigger.waitFor({ state: "visible", timeout: 5_000 });
    await dobTrigger.click({ force: true });

    // Pilih Bulan
    const monthSelect = page.locator("select").first();
    if (await monthSelect.isVisible().catch(() => false)) {
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const monthValue = !isNaN(Number(user.dobMonth))
        ? months[parseInt(user.dobMonth, 10) - 1]
        : user.dobMonth;

      await monthSelect.selectOption({ label: monthValue }).catch(async () => {
        await monthSelect.selectOption(user.dobMonth);
      });
    }

    // Pilih Tahun
    const yearSelect = page.locator("select").last();
    if (await yearSelect.isVisible().catch(() => false)) {
      await yearSelect.selectOption(user.dobYear);
    }

    // Pilih Angka Hari
    const dayNumber = parseInt(user.dobDay, 10).toString();
    const dayBtn = page
      .locator('button[name="day"]:not([aria-disabled="true"]), table button:not([disabled])')
      .filter({
        hasText: new RegExp(`^${dayNumber}$`),
      })
      .first();

    await dayBtn.waitFor({ state: "visible", timeout: 3_000 });
    await dayBtn.click({ force: true });
  } catch {
    const dayNumber = parseInt(user.dobDay, 10).toString();
    await page.getByRole("button", { name: dayNumber, exact: true }).first().click({ force: true }).catch(() => {});
  }
}

// 5. FILL PERSONAL INFORMATION (INSTANT EVALUATE)
async function fillPersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] ⚡ Mengisi Personal Information secara instan...`);

  const nameInput = page.locator('input[name="firstname"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });

  await page.evaluate((u) => {
    const fields = [
      { selector: 'input[name="firstname"]', val: u.fullName },
      { selector: 'input[name="email"]', val: u.email },
      { selector: 'input[inputmode="numeric"]', val: u.phone },
      { selector: 'input[name="identity_id"]', val: u.identityId }
    ];

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    fields.forEach((item) => {
      const input = document.querySelector(item.selector) as HTMLInputElement | null;
      if (input && item.val) {
        if (nativeSetter) {
          nativeSetter.call(input, item.val);
        } else {
          input.value = item.val;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    });
  }, user);

  await fillDateOfBirth(page, user, userId);
  await page.locator(`button[value="${user.gender}"]`).click({ force: true });

  console.log(`[${userId}] ✅ Identitas & Data Diri instan terisi.`);
}

// 6. METODE PEMBAYARAN
async function selectMethodPayment(page: Page, methodPaymentName: string, userId: string) {
  console.log(`[${userId}] 🏦 Mencari metode pembayaran: ${methodPaymentName}...`);
  
  const methodPayment = page.locator('button, div[role="button"]')
    .filter({ hasText: new RegExp(`^\\s*${methodPaymentName}\\s*$`, "i") })
    .first();

  try {
    await methodPayment.waitFor({ state: "visible", timeout: 5_000 });
    await methodPayment.click({ force: true });
    console.log(`[${userId}] ✅ Accordion ${methodPaymentName} berhasil dibuka.`);
  } catch {
    console.log(`[${userId}] ℹ️ Accordion ${methodPaymentName} mungkin sudah terbuka / fallback.`);
  }
}

async function selectVirtualAccount(page: Page, vaName: string, userId: string) {
  console.log(`[${userId}] 🔘 Memilih VA: ${vaName}...`);
  const optionVirtualAccount = page.getByLabel(`${vaName}`, { exact: true }).first();

  await optionVirtualAccount.waitFor({ state: "visible", timeout: 10_000 });
  await optionVirtualAccount.click({ force: true });
  console.log(`[${userId}] ✅ ${vaName} dipilih.`);
}

// 7. SYARAT KETENTUAN & PRIVACY
async function syaratKetentuanPrivacy(page: Page, userId: string) {
  const termsCheckbox = page.locator("#terms");
  await termsCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await termsCheckbox.check();

  const privacyCheckbox = page.locator("#consent");
  await privacyCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await privacyCheckbox.check();
}

// 8. CHECKBOX WHATSAPP NOTIFICATION
async function notifWhatsapp(page: Page, userId: string) {
  const notifWhatsapp = page.locator("#whatsapp");
  await notifWhatsapp.waitFor({ state: "visible", timeout: 10_000 });
  await notifWhatsapp.check();
}

// 9. BAYAR SEKARANG & SCRAPE DATA TRANSAKSI
async function bayarSekarang(
  page: Page,
  user: UserData,
  userId: string,
  index: number,
  startTime: number
) {
  console.log(`[${userId}] 💳 Menekan tombol Bayar Sekarang...`);
  const payBtn = page.getByRole("button", { name: "Bayar Sekarang" });

  await payBtn.waitFor({ state: "visible", timeout: 10_000 });
  await payBtn.scrollIntoViewIfNeeded();
  await payBtn.click();
  console.log(`[${userId}] 🚀 Berhasil mengeklik tombol Bayar Sekarang!`);

  await page.waitForLoadState("networkidle").catch(() => {});
  
  const orderContainer = page.locator('body').filter({
    hasText: /Kode Pemesanan|Virtual Account|Nomor VA|Total Pembayaran/i,
  });
  await orderContainer.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1_500);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const allSpans = await page.locator("span, div, p").allInnerTexts().catch(() => []);
  const cleanedSpans = allSpans.map((t) => t.trim()).filter(Boolean);

  let bookingCode = "-";
  const bookingCodeLocator = page
    .locator("div")
    .filter({ has: page.locator("span", { hasText: /^Kode Pemesanan$/i }) })
    .locator("span.font-medium, span")
    .last();

  if (await bookingCodeLocator.isVisible().catch(() => false)) {
    const extractedText = (await bookingCodeLocator.innerText()).trim();
    if (extractedText && !/kode/i.test(extractedText)) {
      bookingCode = extractedText;
    }
  }

  if (bookingCode === "-") {
    const blackListWords = ["PENDING", "PAID", "EXPIRED", "SUCCESS", "VIRTUAL", "ACCOUNT", "BCA", "MANDIRI", "BNI", "BRI", "CREDIT", "CARD"];
    const matchedCode = cleanedSpans.find(
      (text) =>
        /^[A-Z0-9]{6,10}$/.test(text) &&
        !blackListWords.includes(text.toUpperCase()) &&
        !text.toLowerCase().includes("kode")
    );
    if (matchedCode) bookingCode = matchedCode;
  }

  let vaNumber = "-";
  const matchedVA = cleanedSpans.find((text) => /^\d{10,25}$/.test(text));
  if (matchedVA) {
    vaNumber = matchedVA;
  } else {
    const regexVaMatch = bodyText.match(/\b\d{10,25}\b/);
    if (regexVaMatch) vaNumber = regexVaMatch[0];
  }

  const vaLabelLocator = page.locator("div.border-web-border-inactive span.font-medium").first();
  const vaLabel = (await vaLabelLocator.isVisible().catch(() => false))
    ? (await vaLabelLocator.innerText()).trim()
    : user.methodPayment || "Virtual Account";

  const paymentDeadlineLocator = page.locator("span.font-semibold.text-web-typography-light").first();
  const paymentDeadline = (await paymentDeadlineLocator.isVisible().catch(() => false))
    ? (await paymentDeadlineLocator.innerText()).trim()
    : "-";

  const totalAmount = cleanedSpans.find((text) => text.startsWith("Rp")) || "-";
  const ticketQty = user.ticketQuantity || process.env.TICKET_QUANTITY || "1";

  const endTime = performance.now();
  const totalExecutionTime = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`========================================`);
  console.log(`[${userId}] 👤 Nama          : ${user.fullName}`);
  console.log(`[${userId}] 🎫 Kode Pemesanan : ${bookingCode}`);
  console.log(`[${userId}] 🎟️ Jumlah Tiket   : ${ticketQty}`);
  console.log(`[${userId}] 🏦 Metode VA      : ${vaLabel}`);
  console.log(`[${userId}] 💳 Nomor VA      : ${vaNumber}`);
  console.log(`[${userId}] 💰 Nominal       : ${totalAmount}`);
  console.log(`[${userId}] ⏰ Batas Waktu    : ${paymentDeadline}`);
  console.log(`[${userId}] ⚡ Waktu Eksekusi : ${totalExecutionTime} detik`);
  console.log(`========================================`);

  const resultData: PaymentResult = {
    userId: user.id || index + 1,
    fullName: user.fullName,
    ticketQuantity: ticketQty,
    bookingCode: bookingCode,
    methodPayment: vaLabel,
    vaNumber: vaNumber,
    amount: totalAmount,
    paymentDeadline: paymentDeadline,
    timestamp: new Date().toISOString(),
  };
  savePaymentResult(resultData);

  const cleanName = user.fullName.replace(/[^a-zA-Z0-9]/g, "_");
  const screenshotPath = `./screenshots/${cleanName}_payment.png`;
  await screenshot(page, screenshotPath);
}

// ============================================================
// SINGLE WORKER TASK EXECUTION
// ============================================================

async function processUserTask(browser: Browser, user: UserData, index: number) {
  const userId = `USER-${index + 1} (${user.fullName})`;
  
  // Staggering Launch
  const delayTime = index * 1500;
  if (delayTime > 0) {
    console.log(`[${userId}] ⏳ Menunggu ${delayTime / 1000} detik sebelum meluncur...`);
    await new Promise((resolve) => setTimeout(resolve, delayTime));
  }

  // --- START TIMER ---
  const startTime = performance.now();
  console.log(`🚀 [${userId}] Memulai bot...`);

  // 1. Inisialisasi Context & Page terlebih dahulu
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  // 2. Pasang Interceptor Route SETELAH 'page' terdefinisi (Mencegah ts2448 & ts2454)
  await page.route("**/*.{png,jpg,jpeg,svg,webp,css,woff,woff2}", (route) => route.abort());
  await page.route("**/*{analytics,google-analytics,facebook,pixel,hotjar}*", (route) => route.abort());

  page.on("domcontentloaded", async () => {
    await injectAntiCookieCSS(page);
  });

  try {
    const qty = user.ticketQuantity || process.env.TICKET_QUANTITY || "1";
    const methodPayment = user.methodPayment || process.env.METHODPAYMENT || "Virtual Account";
    const va = user.va || process.env.VA || "BCA";
    const vipCode = user.vipCode || process.env.VIP_CODE || "";

    // Alur Utama
    await openEvent(page, userId);
    await handleQueueAndAccess(page, vipCode, userId);
    await selectFirstAvailableTicket(page, qty, userId);
    await pesanSekarang(page, userId);
    await syaratKetentuan(page, userId);
    await fillPersonalInformation(page, user, userId);
    await selectMethodPayment(page, methodPayment, userId);
    await selectVirtualAccount(page, va, userId);
    await syaratKetentuanPrivacy(page, userId);
    await notifWhatsapp(page, userId);
    
    await bayarSekarang(page, user, userId, index, startTime);

    console.log(`\n🎉 [${userId}] PROSES OTOMATIS TIKET SELESAI!`);
    console.log(`📍 URL: ${page.url()}\n`);

  } catch (error) {
    const errorTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ [${userId}] TERJADI ERROR (Waktu berjalan: ${errorTime}s):`, error);
    await screenshot(page, `./screenshots/error-user-${index + 1}-${Date.now()}.png`);
  }
}

// ============================================================
// MAIN EXECUTION (MULTI-DATA PARALLEL)
// ============================================================

async function main() {
  console.log("");
  console.log("==================================================");
  console.log("   LOKET BTS 2026 BOT (MULTI-DATA PARALLEL MODE)");
  console.log("==================================================");
  console.log("");

  const jsonPath = path.join(__dirname, "users.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ File users.json tidak ditemukan! Buat file users.json terlebih dahulu.");
    return;
  }

  const usersList: UserData[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📋 Berhasil memuat ${usersList.length} data pengguna dari users.json.\n`);

  const browser = await chromium.launch({
    headless: false, // Berjalan secara senyap (tanpa GUI) untuk performa maksimum
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  const tasks = usersList.map((user, index) => processUserTask(browser, user, index));
  await Promise.all(tasks);
}

main();
