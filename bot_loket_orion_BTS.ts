import { chromium, Page } from "playwright";
import dotenv from "dotenv";

dotenv.config();

// ============================================================
// CONFIG
// ============================================================

const EVENT_URL =
  "https://bigbanginjakarta.com/#tickets";

// ============================================================
// USER DATA
// ============================================================

const USER = {
  firstName: process.env.FIRST_NAME ?? "",
  lastName: process.env.LAST_NAME ?? "",
  email: process.env.EMAIL ?? "",
  phone: process.env.PHONE ?? "",
  identityId: process.env.IDENTITY_ID ?? "",

  dobDay: process.env.DOB_DAY ?? "",
  dobMonth: process.env.DOB_MONTH ?? "",
  dobYear: process.env.DOB_YEAR ?? "",

  gender: process.env.GENDER ?? "",
};

const TICKET_TARGET = {
  categoryName: process.env.TICKET_CATEGORY ?? "",
  quantity: process.env.TICKET_QUANTITY ?? "1",
};

// ============================================================
// HELPER
// ============================================================

async function screenshot(
  page: Page,
  name: string
) {
  try {
    await page.screenshot({
      path: name,
      fullPage: true,
    });

    console.log(`📸 Screenshot: ${name}`);
  } catch {
    console.log("⚠️ Gagal mengambil screenshot.");
  }
}

async function waitShort(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// VALIDATE ENV
// ============================================================

function validateUser() {
  const required = [
    ["FIRST_NAME", USER.firstName],
    ["LAST_NAME", USER.lastName],
    ["EMAIL", USER.email],
    ["PHONE", USER.phone],
    ["IDENTITY_ID", USER.identityId],
    ["DOB_DAY", USER.dobDay],
    ["DOB_MONTH", USER.dobMonth],
    ["DOB_YEAR", USER.dobYear],
    ["TICKET_CATEGORY", TICKET_TARGET.categoryName],
    ["TICKET_QUANTITY", TICKET_TARGET.quantity],
  ];

  const missing = required
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Data .env belum lengkap: ${missing.join(", ")}`
    );
  }
}

// ============================================================
// HANDLE COOKIE POPUP (SPECIFIC DOM CLASS)
// ============================================================
async function dismissCookieBanner(page: Page) {
  try {
    // Selector spesifik dari CookieYes DOM (.cky-btn-accept & data-cky-tag)
    const acceptBtn = page.locator('.cky-btn-accept, button[data-cky-tag="accept-button"]').first();

    await acceptBtn.waitFor({ state: "visible", timeout: 2_500 });
    await acceptBtn.click({ force: true });
    console.log("🍪 Pop-up Cookie (.cky-btn-accept) berhasil ditutup!");
    await waitShort(300);
  } catch {
    // Abaikan jika pop-up cookie tidak muncul di layar
  }
}

// ============================================================
// 1. OPEN EVENT
// ============================================================

async function openEvent(page: Page) {
  console.log("🌐 Membuka event...");

  await page.goto(EVENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Bersihkan cookie banner segera setelah halaman terbuka
  await dismissCookieBanner(page);

  console.log("✅ Event terbuka.");
}

// ============================================================
// 2. CLICK BELI TIKET
// ============================================================

async function clickBuyTicket(page: Page) {
  console.log("🎟️ Mencari tombol pembelian...");
  const buyButtons = page.locator('button:has-text("Buy Ticket")');

  await buyButtons.waitFor({
    state: "visible",
    timeout: 5_000,
  });

  await buyButtons.scrollIntoViewIfNeeded();

  console.log("✅ Tombol Beli Tiket ditemukan.");

  await buyButtons.click({ force: true });

  console.log("🖱️ Beli Tiket diklik.");

  await page.waitForTimeout(1_000);
}

// ============================================================
// 3. FIND FIRST AVAILABLE TICKET & PICK QUANTITY (FAST VERSION)
// ============================================================
async function selectFirstAvailableTicket(page: Page) {
  console.log("🔎 Mencari tombol 'Pilih' pada kategori pertama...");

  // Tutup cookie banner SEKALI saja di awal sebelum klik
  await dismissCookieBanner(page);

  // 1. Lokasi tombol 'Pilih'
  const pilihButton = page.locator('button').filter({
    hasText: /pilih/i
  }).first();

  await pilihButton.waitFor({ state: "visible", timeout: 15_000 });
  await pilihButton.scrollIntoViewIfNeeded();

  console.log("🖱️ Membuka dropdown pilihan tiket...");
  await pilihButton.click({ force: true });

  // 2. Langsung pilih jumlah tiket tanpa jeda penantian cookie
  await pickQuantity(page, TICKET_TARGET.quantity || "1");
}

// Helper khusus untuk memilih jumlah tiket dari Popover Radix UI
async function pickQuantity(page: Page, quantity = "1") {
  console.log(`🔢 Memilih jumlah tiket (${quantity})...`);

  // Selector cepat langsung menyasar item angka di portal Radix
  const optionItem = page
    .locator('[role="menuitem"], [role="option"], button, div')
    .filter({
      hasText: new RegExp(`^\\s*${quantity}\\s*$`)
    })
    .first();

  try {
    // Beri timeout singkat (1 detik) agar jika cepat langsung terklik
    await optionItem.waitFor({ state: "visible", timeout: 1_000 });
    await optionItem.click({ force: true });
    console.log(`✅ Berhasil memilih ${quantity} tiket.`);
  } catch (e) {
    // Fallback instan jika selector role tidak langsung merespons
    console.log("⚠️ Fallback klik opsi angka...");
    await page.getByText(quantity, { exact: true }).last().click({ force: true });
  }
}

// ============================================================
// MAIN (INCOGNITO MODE)
// ============================================================

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("    LOKET DWP 2026 BOT (INCOGNITO MODE)");
  console.log("==========================================");
  console.log("");

  validateUser();

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768,
    },
  });

  const page = await context.newPage();

  try {
    // 1. Open Event
    await openEvent(page);

    // 2. Click Buy Ticket
    await clickBuyTicket(page);

    // 3. Select Ticket & Quantity
    await selectFirstAvailableTicket(page);

    console.log("");
    console.log("==========================================");
    console.log("✅ PROSES OTOMATIS TIKET SELESAI");
    console.log("==========================================");
    console.log(`📍 URL: ${page.url()}`);
    console.log("");

    // Tahan browser agar tidak langsung tertutup
    await new Promise(() => {});
  } catch (error) {
    console.log("");
    console.log("❌ TERJADI ERROR");
    console.error(error);

    await screenshot(page, `error-${Date.now()}.png`);

    console.log("");
    console.log(`📍 URL terakhir: ${page.url()}`);

    await context.close();
    await browser.close();
  }
}

main();
