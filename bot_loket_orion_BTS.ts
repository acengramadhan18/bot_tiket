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

// 5. FILL PERSONAL INFORMATION
async function fillPersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] 📝 Mengisi Personal Information...`);

  // Full Name
  const nameInput = page.locator('input[name="firstname"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });
  await nameInput.fill(user.fullName);

  // Email
  const emailInput = page.locator('input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(user.email);

  // No. HP
  const phoneInput = page.locator('input[inputmode="numeric"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 10_000 });
  await phoneInput.clear();
  await phoneInput.fill(user.phone);

  // Identity
  const identityInput = page.locator('input[name="identity_id"]').first();
  await identityInput.waitFor({ state: "visible", timeout: 10_000 });
  await identityInput.fill(user.identityId);

  // Date of Birth
  await fillDateOfBirth(page, user, userId);

  // Gender
  await page.locator(`button[value="${user.gender}"]`).click({ force: true });
  console.log(`[${userId}] ✅ Identitas & Data Diri lengkap terisi.`);
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

// 6. METODE PEMBAYARAN
async function selectMethodPayment(page: Page, methodPaymentName: string, userId: string) {
  console.log(`[${userId}] 🏦 Mencari ${methodPaymentName}...`);
  const methodPayment = page.locator('button[data-state="closed"]').filter({
    hasText: new RegExp(methodPaymentName, "i"),
  }).first();

  try {
    await methodPayment.waitFor({ state: "visible", timeout: 3_000 });
    await methodPayment.click({ force: true });
  } catch {
    console.log(`[${userId}] ℹ️ Accordion ${methodPaymentName} sudah terbuka.`);
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
async function bayarSekarang(page: Page, user: UserData, userId: string, index: number) {
  console.log(`[${userId}] 💳 Menekan tombol Bayar Sekarang...`);
  const payBtn = page.getByRole("button", { name: "Bayar Sekarang" });

  await payBtn.waitFor({ state: "visible", timeout: 10_000 });
  await payBtn.scrollIntoViewIfNeeded();
  await payBtn.click();
  console.log(`[${userId}] 🚀 Berhasil mengeklik tombol Bayar Sekarang!`);

  // --- 1. TUNGGU HALAMAN KONFIRMASI PEMBAYARAN SELESAI LOAD ---
  // Menunggu bekas Kad Pembayaran atau label "Kode Pemesanan" muncul di DOM
  const orderContainer = page.locator('div.border-web-border-inactive, *:has-text("Kode Pemesanan")').first();
  await orderContainer.waitFor({ state: "visible", timeout: 25_000 });
  
  // Beri sedikit masa untuk rendering teks respons server
  await page.waitForTimeout(1_000);

  // --- 2. AMBIL KODE PEMESANAN (Eksklusif & Tepat) ---
  // Strategi A: Cari label "Kode Pemesanan", lalu ambil span nilai di samping/bawahnya
  const bookingCodeLocator = page
    .locator('div')
    .filter({ has: page.locator('span', { hasText: /^Kode Pemesanan$/i }) })
    .locator('span.font-medium, span')
    .last();

  let bookingCode = "-";
  if (await bookingCodeLocator.isVisible().catch(() => false)) {
    const extractedText = (await bookingCodeLocator.innerText()).trim();
    // Validasi agar tidak mengambil kata label "Kode Pemesanan" atau kata status
    if (
      extractedText &&
      !/kode/i.test(extractedText) &&
      !/pending|paid|expired|success|bca|virtual/i.test(extractedText)
    ) {
      bookingCode = extractedText;
    }
  }

  // Strategi B (Fallback): Cari dari array span dengan filter ketat
  if (bookingCode === "-") {
    const allSpans = await page.locator('div.border-web-border-inactive span').allInnerTexts();
    const cleanedSpans = allSpans.map((t) => t.trim()).filter(Boolean);

    const blackListWords = ["PENDING", "PAID", "EXPIRED", "SUCCESS", "VIRTUAL", "ACCOUNT", "BCA", "MANDIRI", "BNI", "BRI"];

    const matchedCode = cleanedSpans.find(
      (text) =>
        /^[A-Z0-9]{6,10}$/.test(text) &&
        !blackListWords.includes(text.toUpperCase()) &&
        !text.toLowerCase().includes("kode")
    );
    if (matchedCode) bookingCode = matchedCode;
  }

  // --- 3. AMBIL BATAS WAKTU PEMBAYARAN ---
  const paymentDeadlineLocator = page.locator('span.font-semibold.text-web-typography-light').first();
  const paymentDeadline = (await paymentDeadlineLocator.isVisible().catch(() => false))
    ? (await paymentDeadlineLocator.innerText()).trim()
    : "-";

  // --- 4. AMBIL METODE PEMBAYARAN (misal: "Virtual Account BCA") ---
  const vaLabelLocator = page.locator('div.border-web-border-inactive span.font-medium').first();
  const vaLabel = (await vaLabelLocator.isVisible().catch(() => false))
    ? (await vaLabelLocator.innerText()).trim()
    : "Virtual Account";

  // --- 5. AMBIL NOMOR VA DAN NOMINAL PEMBAYARAN ---
  const allSpans = await page.locator('div.border-web-border-inactive span').allInnerTexts();
  const cleanedSpans = allSpans.map((t) => t.trim()).filter(Boolean);

  // Fallback Kode Pemesanan jika locator atas meleset
  if (bookingCode === "-") {
    const matchedCode = cleanedSpans.find(
      (text) =>
        /^[A-Z0-9]{6,10}$/.test(text) &&
        !text.toLowerCase().includes("virtual") &&
        !text.toLowerCase().includes("kode")
    );
    if (matchedCode) bookingCode = matchedCode;
  }

  // --- AMBIL QUANTITY TIKET ---
  // A. Menggunakan data input user (Paling Akurat & Cepat)
  let ticketQty = user.ticketQuantity || process.env.TICKET_QUANTITY || "1";

  // B. Fallback Scraping dari Halaman Konfirmasi (Mencari pola angka x tiket, contoh: "1x" atau "1 Tiket")
  if (!ticketQty) {
    const allSpans = await page.locator('div.border-web-border-inactive span').allInnerTexts();
    const qtyMatch = allSpans.find((t) => /^\d+\s*(x|tiket)/i.test(t.trim()));
    if (qtyMatch) {
      ticketQty = qtyMatch.trim();
    }
  }

  // Filter Nomor VA (10-25 digit)
  const vaNumber = cleanedSpans.find((text) => /^\d{10,25}$/.test(text)) || "-";

  // Filter Nominal (Bermula dengan 'Rp')
  const totalAmount = cleanedSpans.find((text) => text.startsWith("Rp")) || "-";

  // Log Hasil ke Terminal
  console.log(`========================================`);
  console.log(`[${userId}] 👤 Nama          : ${user.fullName}`);
  console.log(`[${userId}] 🎫 Kode Pemesanan : ${bookingCode}`);
  console.log(`[${userId}] 🎟️ Jumlah Tiket   : ${ticketQty}`);
  console.log(`[${userId}] 🏦 Metode VA      : ${vaLabel}`);
  console.log(`[${userId}] 💳 Nomor VA      : ${vaNumber}`);
  console.log(`[${userId}] 💰 Nominal       : ${totalAmount}`);
  console.log(`[${userId}] ⏰ Batas Waktu    : ${paymentDeadline}`);
  console.log(`========================================`);

  // Simpan Ke File results.json
  const resultData: PaymentResult = {
    userId: user.id || index + 1,
    fullName: user.fullName,
    bookingCode: bookingCode,
    methodPayment: vaLabel,
    vaNumber: vaNumber,
    amount: totalAmount,
    paymentDeadline: paymentDeadline,
    timestamp: new Date().toISOString(),
  };
  savePaymentResult(resultData);

  // Ambil Tangkapan Layar (Screenshot)
  const cleanName = user.fullName.replace(/[^a-zA-Z0-9]/g, "_");
  const screenshotPath = `./screenshots/${cleanName}_payment.png`;
  await screenshot(page, screenshotPath);
}

// ============================================================
// SINGLE WORKER TASK EXECUTION
// ============================================================

async function processUserTask(browser: Browser, user: UserData, index: number) {
  const userId = `USER-${index + 1} (${user.fullName})`;
  
  // Staggering Launch (Jeda 1.5 detik antar user agar tidak kena Rate-Limit IP)
  const delayTime = index * 1500;
  if (delayTime > 0) {
    console.log(`[${userId}] ⏳ Menunggu ${delayTime / 1000} detik sebelum meluncur...`);
    await new Promise((resolve) => setTimeout(resolve, delayTime));
  }

  console.log(`🚀 [${userId}] Memulai bot...`);

  // Context terisolasi per user (Incognito)
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    /*
    proxy: {
      server: 'http://proxy-server.com:8080', // Hanya Host & Port
      username: 'username_proxy_kamu',        // Username dipisah
      password: 'password_proxy_kamu'         // Password dipisah
    }
    */
  });

  const page = await context.newPage();

  // Otomatis suntikkan CSS Anti-Cookie di setiap navigasi
  page.on("domcontentloaded", async () => {
    await injectAntiCookieCSS(page);
  });

  try {
    const qty = user.ticketQuantity || process.env.TICKET_QUANTITY || "1";
    const methodPayment = user.methodPayment || process.env.METHODPAYMENT || "Virtual Account";
    const va = user.va || process.env.VA || "BCA";

    // Workflow
    await openEvent(page, userId);
    await clickBuyTicket(page, userId);
    await selectFirstAvailableTicket(page, qty, userId);
    await pesanSekarang(page, userId);
    await syaratKetentuan(page, userId);
    await fillPersonalInformation(page, user, userId);
    await selectMethodPayment(page, methodPayment, userId);
    await selectVirtualAccount(page, va, userId);
    await syaratKetentuanPrivacy(page, userId);
    // await notifWhatsapp(page, userId);
    await bayarSekarang(page, user, userId, index);

    console.log(`\n🎉 [${userId}] PROSES OTOMATIS TIKET SELESAI!`);
    console.log(`📍 URL: ${page.url()}\n`);

  } catch (error) {
    console.error(`❌ [${userId}] TERJADI ERROR:`, error);
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

main();
