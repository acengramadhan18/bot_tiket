import { chromium, Page, Browser } from "playwright";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Tentukan path ke file .env2 (sebagai fallback/config global)
dotenv.config({ path: ".env2" });

// ============================================================
// CONFIG & TYPES
// ============================================================

const EVENT_URL = "https://bigbanginjakarta.com/#tickets";

interface UserData {
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
}

// ============================================================
// HELPER
// ============================================================

async function screenshot(page: Page, name: string) {
  try {
    await page.screenshot({ path: name, fullPage: true });
    console.log(`📸 Screenshot: ${name}`);
  } catch {
    console.log("⚠️ Gagal mengambil screenshot.");
  }
}

async function waitShort(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// INJEKSI CSS GLOBAL: SEMBUNYIKAN POPUP COOKIE DI MANAPUN
// ============================================================

async function injectAntiCookieCSS(page: Page) {
  await page.addStyleTag({
    content: `
      .cky-consent-container, 
      .cky-overlay, 
      .cky-modal,
      [data-cky-tag="notice-wrapper"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `
  }).catch(() => {});
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

  const pilihButton = page.locator('button').filter({ hasText: /pilih/i }).first();

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
      hasText: new RegExp(`^\\s*${quantity}\\s*$`)
    })
    .first();

  try {
    await optionItem.waitFor({ state: "visible", timeout: 1_000 });
    await optionItem.click({ force: true });
    console.log(`[${userId}] ✅ Berhasil memilih ${quantity} tiket.`);
  } catch (e) {
    console.log(`[${userId}] ⚠️ Fallback klik opsi angka...`);
    await page.getByText(quantity, { exact: true }).last().click({ force: true });
  }
}

// 4. PESAN TIKET & SYARAT KETENTUAN
async function pesanSekarang(page: Page, userId: string) {
  console.log(`[${userId}] ➡️ Siap Order...`);
  const btnPesan = page.locator('button').filter({ hasText: /Pesan Sekarang/i }).first();

  await btnPesan.waitFor({ state: "visible", timeout: 5_000 });
  await btnPesan.click({ force: true });
}

async function syaratKetentuan(page: Page, userId: string) {
  console.log(`[${userId}] 📜 Scroll syarat ketentuan...`);
  
  // 1. Cari dan klik tombol "Scroll to bottom"
  const scrollBottomBtn = page.getByRole('button', { name: 'Scroll to bottom' });
  await scrollBottomBtn.waitFor({ state: "visible", timeout: 5_000 });
  await scrollBottomBtn.click({ force: true });
  console.log(`[${userId}] ⬇️ Tombol auto scroll to bottom diklik.`);

  // 2. Beri jeda singkat agar animasi scroll selesai & state tombol "Ya" menjadi aktif
  await page.waitForTimeout(500);

  // 3. Target tombol "Ya" secara presisi dan gunakan force click
  const btnSetuju = page.getByRole('button', { name: 'Ya', exact: true });
  await btnSetuju.waitFor({ state: "visible", timeout: 5_000 });
  await btnSetuju.click({ force: true });
  console.log(`[${userId}] ✅ Tombol "Ya" Syarat & Ketentuan berhasil diklik.`);

  // 4. Pastikan modal dialog Syarat & Ketentuan benar-benar hilang dari layar
  await page.locator('div[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
}

// 5. FILL PERSONAL INFORMATION
async function fillPersonalInformation(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] 📝 Mengisi Personal Information...`);

  // Full Name
  const nameInput = page.locator('input[name="firstname"]').first();
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });
  await nameInput.fill(user.fullName);
  console.log(`[${userId}] ✅ Nama Lengkap terisi: ${user.fullName}`);

  // Email
  const emailInput = page.locator('input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(user.email);
  console.log(`[${userId}] ✅ Email terisi: ${user.email}`);

  // No. HP
  const phoneInput = page.locator('input[inputmode="numeric"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 10_000 });
  await phoneInput.clear();
  await phoneInput.fill(user.phone);
  console.log(`[${userId}] ✅ No. Handphone terisi: ${user.phone}`);

  // Identity
  const identityInput = page.locator('input[name="identity_id"]').first();
  await identityInput.waitFor({ state: "visible", timeout: 10_000 });
  await identityInput.fill(user.identityId);
  console.log(`[${userId}] ✅ Identitas terisi: ${user.identityId}`);

  // Date of Birth
  await fillDateOfBirth(page, user, userId);

  // Gender
  await page.locator(`button[value="${user.gender}"]`).click({ force: true });
  console.log(`[${userId}] ✅ Gender dipilih.`);
}

async function fillDateOfBirth(page: Page, user: UserData, userId: string) {
  console.log(`[${userId}] 📅 Mengisi Tanggal Lahir...`);

  const dobTrigger = page.locator('button').filter({ hasText: /Pilih Tanggal Lahir/i }).first();

  try {
    await dobTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await dobTrigger.click({ force: true });
    await page.waitForTimeout(300);

    // Pilih Bulan
    const monthSelect = page.locator('select').first();
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
    const yearSelect = page.locator('select').last();
    if (await yearSelect.isVisible().catch(() => false)) {
      await yearSelect.selectOption(user.dobYear);
    }

    await page.waitForTimeout(300);

    // Pilih Angka Hari
    const dayNumber = parseInt(user.dobDay, 10).toString();
    const dayBtn = page
      .locator('button[name="day"]:not([aria-disabled="true"]), table button:not([disabled])')
      .filter({
        hasText: new RegExp(`^${dayNumber}$`)
      })
      .first();

    await dayBtn.waitFor({ state: "visible", timeout: 5_000 });
    await dayBtn.click({ force: true });

    console.log(`[${userId}] ✅ Tanggal Lahir berhasil dipilih: ${dayNumber} ${user.dobMonth} ${user.dobYear}`);
  } catch (error) {
    console.log(`[${userId}] ⚠️ Fallback tanggal lahir...`);
    const dayNumber = parseInt(user.dobDay, 10).toString();
    await page.getByRole('button', { name: dayNumber, exact: true }).first().click({ force: true });
  }
}

// 6. METODE PEMBAYARAN
async function selectMethodPayment(page: Page, methodPaymentName: string, userId: string) {
  console.log(`[${userId}] 🏦 Mencari ${methodPaymentName}...`);

  const methodPayment = page.locator('button[data-state="closed"]').filter({
    hasText: new RegExp(methodPaymentName, 'i')
  }).first();

  try {
    await methodPayment.waitFor({ state: "visible", timeout: 3_000 });
    await methodPayment.click({ force: true });
    console.log(`[${userId}] ✅ Pilihan ${methodPaymentName} berhasil dibuka!`);
  } catch (error) {
    console.log(`[${userId}] ℹ️ Accordion ${methodPaymentName} sudah terbuka atau tidak ditemukan.`);
  }
}

async function selectVirtualAccount(page: Page, vaName: string, userId: string) {
  console.log(`[${userId}] 🔘 Memilih ${vaName}...`);

  const optionVirtualAccount = page.getByLabel(`${vaName}`, { exact: true }).first();

  await optionVirtualAccount.waitFor({ state: 'visible', timeout: 10_000 });
  await optionVirtualAccount.click();

  console.log(`[${userId}] ✅ ${vaName} berhasil diklik`);
}

// 7. SYARAT KETENTUAN & PRIVACY
async function syaratKetentuanPrivacy(page: Page, userId: string) {
  console.log(`[${userId}] ☑️ Mencari checkbox Terms & Conditions...`);

  const termsCheckbox = page.locator('#terms');
  await termsCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await termsCheckbox.check();

  console.log(`[${userId}] ✅ Terms & Conditions dicentang.`);

  console.log(`[${userId}] ☑️ Mencari Personal Data Processing Policy...`);

  const privacyCheckbox = page.locator('#consent');
  await privacyCheckbox.waitFor({ state: "visible", timeout: 10_000 });
  await privacyCheckbox.check();

  console.log(`[${userId}] ✅ Personal Data Processing Policy dicentang.`);
  await waitShort(500);
}

// 8. BAYAR SEKARANG
async function bayarSekarang(page: Page, userId: string) {
  console.log(`[${userId}] 💳 Menekan tombol Bayar Sekarang...`);
  const btnBayar = page.locator('button').filter({ hasText: /Bayar Sekarang/i }).first();
  await btnBayar.click({ force: true });
}

// ============================================================
// SINGLE WORKER TASK EXECUTION
// ============================================================

async function processUserTask(browser: Browser, user: UserData, index: number) {
  const userId = `USER-${index + 1} (${user.fullName})`;
  console.log(`🚀 [${userId}] Memulai bot...`);

  // Context terisolasi per user (Incognito)
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  // Otomatis suntikkan CSS Anti-Cookie di setiap navigasi
  page.on('domcontentloaded', async () => {
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
    await bayarSekarang(page, userId);

    console.log(`\n🎉 [${userId}] PROSES OTOMATIS TIKET SELESAI!`);
    console.log(`📍 URL: ${page.url()}\n`);

    // Tahan browser window per user ini agar tetap terbuka untuk pembayaran
    await new Promise(() => {});
  } catch (error) {
    console.error(`❌ [${userId}] TERJADI ERROR:`, error);
    await screenshot(page, `error-user-${index + 1}-${Date.now()}.png`);
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
    console.error("❌ File users.json tidak ditemukan! Buat file users.json terlebih dahulu di direktori utama.");
    return;
  }

  const usersList: UserData[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📋 Berhasil memuat ${usersList.length} data pengguna dari users.json.\n`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  // JALANKAN SEMUA DATA PENGGUNA BERSAMAAN (PARALEL)
  const tasks = usersList.map((user, index) => processUserTask(browser, user, index));
  await Promise.all(tasks);
}

main();
