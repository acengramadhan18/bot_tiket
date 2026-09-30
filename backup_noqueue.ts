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

// 2. CLICK BELI TIKET
async function clickBuyTicket(page: Page, userId: string) {
  console.log(`[${userId}] 🎟️ Mencari tombol pembelian...`);
  const buyButtons = page.locator('button:has-text("Buy Ticket")');

  await buyButtons.waitFor({ state: "visible", timeout: 5_000 });
  await buyButtons.scrollIntoViewIfNeeded();
  await buyButtons.click({ force: true });

  console.log(`[${userId}] 🖱️ Beli Tiket diklik.`);
  await page.waitForTimeout(1_000);
}

// 3. FIND FIRST AVAILABLE TICKET & PICK QUANTITY
async function selectFirstAvailableTicket(page: Page, quantity: string, userId: string) {
  console.log(`[${userId}] 🔎 Mencari tombol 'Pilih' pada kategori pertama...`);

  const pilihButton = page.locator("button").filter({ hasText: /pilih/i }).first();

  await pilihButton.waitFor({ state: "visible", timeout: 15_000 });
  await pilihButton.scrollIntoViewIfNeeded();

  console.log(`[${userId}] 🖱️ Membuka dropdown pilihan tiket...`);
  await pilihButton.click({ force: true });

  await pickQuantity(page, quantity, userId);
}

async function pickQuantity(page: Page, quantity = "1", userId: string) {
  console.log(`[${userId}] 🔢 Memilih jumlah tiket (${quantity})...`);

  const optionItem = page
    .locator('[role="menuitem"], [role="option"], button, div')
    .filter({
      hasText: new RegExp(`^\\s*${quantity}\\s*$`),
    })
    .first();

  try {
    await optionItem.waitFor({ state: "visible", timeout: 1_000 });
    await optionItem.click({ force: true });
    console.log(`[${userId}] ✅ Berhasil memilih ${quantity} tiket.`);
  } catch {
    console.log(`[${userId}] ⚠️ Fallback klik opsi angka...`);
    await page.getByText(quantity, { exact: true }).last().click({ force: true });
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
  await scrollBottomBtn.waitFor({ state: "visible", timeout: 5_000 });
  await scrollBottomBtn.click();

  const btnSetuju = page.getByRole("button", { name: "Ya", exact: true });
  await btnSetuju.waitFor({ state: "visible", timeout: 2_000 });
  await btnSetuju.click();
  console.log(`[${userId}] ✅ Tombol "Ya" Syarat & Ketentuan berhasil diklik.`);

  await page.locator('div[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

async function fillDateOfBirth(page: Page, user: UserData, userId: string) {
  const dobTrigger = page.locator("button").filter({ hasText: /Pilih Tanggal Lahir/i }).first();

  try {
    await dobTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await dobTrigger.click({ force: true });
    await page.waitForTimeout(300);

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

    await page.waitForTimeout(300);

    // Pilih Angka Hari
    const dayNumber = parseInt(user.dobDay, 10).toString();
    const dayBtn = page
      .locator('button[name="day"]:not([aria-disabled="true"]), table button:not([disabled])')
      .filter({
        hasText: new RegExp(`^${dayNumber}$`),
      })
      .first();

    await dayBtn.waitFor({ state: "visible", timeout: 5_000 });
    await dayBtn.click({ force: true });
  } catch {
    const dayNumber = parseInt(user.dobDay, 10).toString();
    await page.getByRole("button", { name: dayNumber, exact: true }).first().click({ force: true });
  }
}

// 5. FILL PERSONAL INFORMATION
async function fillPersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] ⚡ Mengisi Personal Information secara instan...`);

  // 1. Tunggu input pertama muncul sebagai penanda formulir sudah loaded
  const nameInput = page.locator('input[name="firstname"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });

  // 2. Injeksi semua nilai input secara bersamaan dalam 1 ms (Tanpa nested function)
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

  // 3. Date of Birth & Gender tetap dijalankan
  await fillDateOfBirth(page, user, userId);
  await page.locator(`button[value="${user.gender}"]`).click({ force: true });

  console.log(`[${userId}] ✅ Identitas & Data Diri instan terisi.`);
}

// 6. METODE PEMBAYARAN
async function selectMethodPayment(page: Page, methodPaymentName: string, userId: string) {
  console.log(`[${userId}] 🏦 Mencari metode pembayaran: ${methodPaymentName}...`);
  
  // Mencari tombol accordion yang tepat dengan regex eksak
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
  await optionVirtualAccount.click();
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

  await waitShort(300);
}

// 8. CHECKBOX WHATSAPP NOTIFICATION
async function notifWhatsapp(page: Page, userId: string) {
  const notifWhatsapp = page.locator("#whatsapp");
  await notifWhatsapp.waitFor({ state: "visible", timeout: 10_000 });
  await notifWhatsapp.check();
  await waitShort(300);
}

// 9. BAYAR SEKARANG & SCRAPE DATA TRANSAKSI
// Tambahkan parameter startTime di baris fungsi
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

  // --- 1. TUNGGU HALAMAN TRANSAKSI DENGAN TIMEOUT LEBIH LONGGAR (UNTUK PARALEL) ---
  await page.waitForLoadState("networkidle").catch(() => {});
  
  // Tunggu indikator transaksi muncul di DOM
  const orderContainer = page.locator('body').filter({
    hasText: /Kode Pemesanan|Virtual Account|Nomor VA|Total Pembayaran/i,
  });
  await orderContainer.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1_500); // Jeda ekstra untuk rendering teks paralel

  // --- 2. SCRAPING TEKS SELURUH HALAMAN (ROBUST FALLBACK) ---
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const allSpans = await page.locator("span, div, p").allInnerTexts().catch(() => []);
  const cleanedSpans = allSpans.map((t) => t.trim()).filter(Boolean);

  // --- 3. KODE PEMESANAN ---
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

  // Fallback Regex Kode Pemesanan jika locator meleset
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

  // --- 4. NOMOR VA ---
  let vaNumber = "-";
  const matchedVA = cleanedSpans.find((text) => /^\d{10,25}$/.test(text));
  if (matchedVA) {
    vaNumber = matchedVA;
  } else {
    // Regex Search langsung dari seluruh teks halaman
    const regexVaMatch = bodyText.match(/\b\d{10,25}\b/);
    if (regexVaMatch) vaNumber = regexVaMatch[0];
  }

  // --- 5. METODE & NOMINAL & BATAS WAKTU ---
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

  // --- TIMER EKSEKUSI ---
  const endTime = performance.now();
  const totalExecutionTime = ((endTime - startTime) / 1000).toFixed(2);

  // LOG TERMINAL
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

  // SIMPAN HASIL
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

  // SCREENSHOT
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
  const startTime = performance.now(); // Catat waktu mulai
  console.log(`🚀 [${userId}] Memulai bot...`);

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  page.on("domcontentloaded", async () => {
    await injectAntiCookieCSS(page);
  });

  try {
    const qty = user.ticketQuantity || process.env.TICKET_QUANTITY || "1";
    const methodPayment = user.methodPayment || process.env.METHODPAYMENT || "Virtual Account";
    const va = user.va || process.env.VA || "BCA";

    // Alur Utama
    await openEvent(page, userId);
    await clickBuyTicket(page, userId);
    await selectFirstAvailableTicket(page, qty, userId);
    await pesanSekarang(page, userId);
    await syaratKetentuan(page, userId);
    await fillPersonalInformation(page, user, userId);
    await selectMethodPayment(page, methodPayment, userId);
    await selectVirtualAccount(page, va, userId);
    await syaratKetentuanPrivacy(page, userId);
    await notifWhatsapp(page, userId);
    
    // Kirim startTime ke fungsi bayarSekarang untuk dihitung di log akhir
    await bayarSekarang(page, user, userId, index, startTime);

    console.log(`\n🎉 [${userId}] PROSES OTOMATIS TIKET SELESAI!`);
    console.log(`📍 URL: ${page.url()}\n`);

  } catch (error) {
    // --- CALCULATE TIMER ON ERROR ---
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
    headless: true, // Ubah ke true jika ingin running tanpa jendela browser
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  // Jalankan semua data pengguna secara paralel dengan staggering
  const tasks = usersList.map((user, index) => processUserTask(browser, user, index));
  await Promise.all(tasks);
}

main();s
