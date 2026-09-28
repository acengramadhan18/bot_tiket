import { chromium, Page } from "playwright";
import dotenv from "dotenv";

dotenv.config();

// ============================================================
// CONFIG
// ============================================================

const EVENT_URL =
  "https://www.loket.com/event/dwp-2026_wVb9?utm_source=eventseruuntukmu&utm_medium=website&utm_content=enterprise&utm_campaign=2857lkt12dwp2026";

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
// 1. OPEN EVENT
// ============================================================

async function openEvent(page: Page) {
  console.log("🌐 Membuka event...");

  await page.goto(EVENT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  console.log("⏳ Menunggu halaman event...");

  await page.waitForLoadState("networkidle", {
    timeout: 15_000,
  }).catch(() => {});

  console.log("✅ Event terbuka.");
}

// ============================================================
// 2. CLICK BELI TIKET
// ============================================================

async function clickBuyTicket(page: Page) {
  console.log("🎟️ Mencari tombol pembelian...");

  const buyButton = page
    .locator("button")
    .filter({
      hasText: /Beli Tiket/i,
    })
    .first();

  await buyButton.waitFor({
    state: "visible",
    timeout: 15_000,
  });

  await buyButton.scrollIntoViewIfNeeded();

  console.log("✅ Tombol Beli Tiket ditemukan.");

  await buyButton.click();

  console.log("🖱️ Beli Tiket diklik.");

  await page.waitForTimeout(1_000);
}

// ============================================================
// 3. FIND FIRST AVAILABLE TICKET
// ============================================================

async function selectFirstAvailableTicket(page: Page) {
  console.log(
    "🔎 Mencari tiket pertama yang tersedia..."
  );

  // Tunggu bagian tiket muncul
  await page
    .getByText(/3 DAY PASS/i)
    .first()
    .waitFor({
      state: "visible",
      timeout: 15_000,
    })
    .catch(() => {});

  // ----------------------------------------------------------
  // Cari card tiket yang memiliki kontrol quantity.
  // Tiket Sold Out biasanya tidak memiliki select quantity.
  // ----------------------------------------------------------

  const quantitySelects = page.locator(
    'select'
  );

  const selectCount = await quantitySelects.count();

  console.log(
    `🔍 Ditemukan ${selectCount} control quantity.`
  );

  let selected = false;

  for (let i = 0; i < selectCount; i++) {
    const select = quantitySelects.nth(i);

    if (!(await select.isVisible().catch(() => false))) {
      continue;
    }

    // Cek apakah select ini berada pada area tiket
    const parentText = await select
      .locator("xpath=..")
      .innerText()
      .catch(() => "");

    console.log(
      `🎟️ Ticket option ${i}: ${parentText
        .replace(/\s+/g, " ")
        .slice(0, 100)}`
    );

    // Quantity 1
    await select.selectOption("1");

    console.log(
      `🎟️ Tiket pertama yang available: index ${i}`
    );

    console.log("✅ Quantity = 1");

    selected = true;
    break;
  }

  if (!selected) {
    throw new Error(
      "Tidak menemukan tiket available."
    );
  }

  await waitShort(500);
}

// ============================================================
// 4. CLICK ORDER NOW
// ============================================================

async function clickOrderNow(page: Page) {
  console.log("➡️ Menyiapkan Order Now...");

  const orderButton = page.getByRole('button', { name: 'Order Now' });

  console.log("🖱️ Klik Order Now...");

  await orderButton.click();

  console.log(
    "✅ Event click selesai."
  );

  console.log(
    "⏳ Menunggu Personal Information..."
  );

  // Jangan hanya mengandalkan perubahan URL.
  const firstNameInput = page
    .locator(
      'input[name="firstname"], input#firstname'
    )
    .first();

  await firstNameInput.waitFor({
    state: "visible",
    timeout: 15_000,
  });

  console.log(
    "✅ Personal Information terbuka."
  );

  console.log(
    `📍 URL: ${page.url()}`
  );
}

// ============================================================
// 5. FILL PERSONAL INFORMATION
// ============================================================

async function fillPersonalInformation(
  page: Page
) {
  console.log(
    "📝 Mengisi Personal Information..."
  );

  // First Name
  const firstName = page.locator(
    'input[name="firstname"], input#firstname'
  ).first();

  if (await firstName.count() > 0) {
    await firstName.fill(USER.firstName);
  }

  // Last Name
  const lastName = page.locator(
    'input[name="lastname"], input#lastname'
  ).first();

  if (await lastName.count() > 0) {
    await lastName.fill(USER.lastName);
  }

  // Email
  const email = page.locator(
    'input[name="email"], input#email'
  ).first();

  if (await email.count() > 0) {
    await email.fill(USER.email);
  }

  // Phone
  const phone = page.locator(
    'input[name="telephone"], input#telephone'
  ).first();

  if (await phone.count() > 0) {
    await phone.fill(USER.phone);
  }

  // Identity
  const identity = page.locator(
    'input[name="identity_id"], input#identity_id'
  ).first();

  if (await identity.count() > 0) {
    await identity.fill(
      USER.identityId
    );
  }

  // ----------------------------------------------------------
  // DATE OF BIRTH
  // ----------------------------------------------------------

  const dobDay = page.locator(
    'select[name="dob_day"]'
  ).first();

  if (await dobDay.count() > 0) {
    await dobDay.selectOption(
      USER.dobDay
    );
  }

  const dobMonth = page.locator(
    'select[name="dob_month"]'
  ).first();

  if (await dobMonth.count() > 0) {
    await dobMonth.selectOption(
      USER.dobMonth
    );
  }

  const dobYear = page.locator(
    'select[name="dob_year"]'
  ).first();

  if (await dobYear.count() > 0) {
    await dobYear.selectOption(
      USER.dobYear
    );
  }

  console.log(
    "✅ Data personal terisi."
  );
}

// ============================================================
// 6. SELECT GENDER + CHECK AGREEMENTS
// ============================================================

async function completePersonalInformation(
  page: Page
) {
  console.log(
    "📝 Menyelesaikan Personal Information..."
  );

  // ==========================================================
  // GENDER
  // ==========================================================

  console.log(
    "🔘 Memilih Gender..."
  );

  // gender_1 = Male
  const maleRadio = page.locator(
    "#gender_1"
  );

  await maleRadio.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  if (
    !(await maleRadio.isChecked())
  ) {
    await maleRadio.check({
      force: true,
    });
  }

  console.log(
    "✅ Gender Male dipilih."
  );

  // ==========================================================
  // TERMS & CONDITIONS
  // ==========================================================

  console.log("☑️ Mencari checkbox Terms & Conditions...");

  const termsCheckbox = page.locator('#accept_toc');

  await termsCheckbox.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await termsCheckbox.check();

  console.log("✅ Terms & Conditions dicentang.");

  // ==========================================================
  // PERSONAL DATA PROCESSING POLICY
  // ==========================================================

  console.log(
    "☑️ Mencari Personal Data Processing Policy..."
  );

  const privacyCheckbox = page.locator('#accept_consent');

  await privacyCheckbox.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await privacyCheckbox.check();

  console.log(
    "✅ Personal Data Processing Policy dicentang."
  );

  await waitShort(500);

  // ==========================================================
  // VALIDASI
  // ==========================================================

  const genderChecked =
    await maleRadio.isChecked();

  console.log(
    `🔘 Gender checked: ${genderChecked}`
  );

  const checkboxes = page.locator(
    'input[type="checkbox"]'
  );

  const checkboxCount =
    await checkboxes.count();

  console.log(
    `☑️ Checkbox ditemukan: ${checkboxCount}`
  );

  for (
    let i = 0;
    i < checkboxCount;
    i++
  ) {
    const checked =
      await checkboxes
        .nth(i)
        .isChecked()
        .catch(() => false);

    console.log(
      `   Checkbox ${i + 1}: ${checked}`
    );
  }

  // ==========================================================
  // NEXT
  // ==========================================================

  const nextButton = page.locator("#btn-register");

  await nextButton.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const nextDisabled =
    await nextButton.isDisabled();

  console.log(
    `🔘 Next disabled: ${nextDisabled}`
  );

  if (nextDisabled) {
    await screenshot(
      page,
      "error-personal-information.png"
    );

    throw new Error(
      "Next masih disabled. Gender atau checkbox belum berhasil dipilih."
    );
  }

  console.log(
    "🖱️ Klik Next..."
  );

  await nextButton.click();

  console.log(
    "✅ Next berhasil diklik."
  );

  await page.waitForTimeout(1_000);
}

// ============================================================
// 7. WAIT PAYMENT
// ============================================================

async function waitForPayment(page: Page) {
  console.log("🏦 Menunggu payment tab...");

  const paymentTab = page.getByRole('tablist', { name: 'Payment type' }).getByText('Pay Now');

  await paymentTab.click();

  console.log("✅ Payment tab ditemukan.");
}

// ============================================================
// 8. SELECT VIRTUAL ACCOUNT
// ============================================================

async function selectVirtualAccount(
  page: Page
) {
  console.log(
    "🏦 Mencari Virtual Account..."
  );

  const virtualAccount = page.getByRole('heading', { name: 'Virtual Account' });

  console.log(
    "🖱️ Membuka Virtual Account..."
  );

  await virtualAccount.click();

  console.log(
    "✅ Virtual Account dibuka."
  );
}

// ============================================================
// 9. SELECT BCA
// ============================================================

async function selectBCA(
  page: Page
) {
  console.log(
    "🔘 Memilih BCA..."
  );

  const bca = page.getByText('Virtual Account BCA', { exact: true }).first();

  await bca.waitFor({
    state: 'visible',
    timeout: 10_000
  });

  await bca.click();

  console.log("✅ BCA berhasil diklik");
}

// ============================================================
// 10. CONFIRM BCA
// ============================================================

async function confirmBCA(
  page: Page
) {
  console.log(
    "⏳ Mengecek confirmation dialog..."
  );

  const confirmation = page
    .getByText(
      /You are choosing Virtual Account BCA/i
    )
    .first();

  try {
    await confirmation.waitFor({
      state: "visible",
      timeout: 1_000,
    });

    console.log(
      "⚠️ Confirmation dialog muncul."
    );

    const okButton = page
      .locator("button")
      .filter({
        hasText: /^OK$/i,
      })
      .first();

    await okButton.waitFor({
      state: "visible",
      timeout: 1_000,
    });

    console.log(
      "🖱️ Klik OK..."
    );

    await okButton.click();

    console.log(
      "✅ Confirmation BCA selesai."
    );
  } catch {
    console.log(
      "ℹ️ Confirmation dialog tidak muncul."
    );
  }
}

// ============================================================
// 11. WAIT CHECKOUT
// ============================================================

async function waitForCheckout(
  page: Page
) {
  console.log(
    "⏳ Menunggu Checkout..."
  );

  const nextButton = page.getByRole('button', { name: 'Next' });
  await nextButton.click();
  const confirmethodpaymentButton = page.getByRole('button', { name: 'OK', exact: true });
  await confirmethodpaymentButton.click();

  const orderReview = page
    .getByText(
      "Order Review",
      {
        exact: true,
      }
    )
    .first();

  try {
    await orderReview.waitFor({
      state: "visible",
      timeout: 15_000,
    });

    console.log(
      "✅ Halaman Checkout terbuka."
    );
  } catch {
    console.log(
      "⚠️ Order Review belum ditemukan."
    );
  }

  const lastconfirmPaymentButton = page.getByRole('button', { name: 'Pay Now' });
  await lastconfirmPaymentButton.click();

  console.log(
    `📍 URL sekarang: ${page.url()}`
  );
}

// ============================================================
// 12. MAIN (INCOGNITO MODE)
// ============================================================

async function main() {
  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    "    LOKET DWP 2026 BOT (INCOGNITO MODE)"
  );
  console.log(
    "=========================================="
  );
  console.log("");

  validateUser();

  // 1. Jalankan browser Chromium dengan flag incognito
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--incognito"
    ],
  });

  // 2. Buat context baru yang terisolasi/bersih dari cache & cookies
  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768,
    },
  });

  // 3. Buka halaman di dalam context incognito
  const page = await context.newPage();

  try {
    // --------------------------------------------------------
    // EVENT
    // --------------------------------------------------------

    await openEvent(page);

    await clickBuyTicket(page);

    // --------------------------------------------------------
    // TICKET
    // --------------------------------------------------------

    await selectFirstAvailableTicket(page);

    // --------------------------------------------------------
    // ORDER
    // --------------------------------------------------------

    await clickOrderNow(page);

    // --------------------------------------------------------
    // PERSONAL INFORMATION
    // --------------------------------------------------------

    await fillPersonalInformation(page);

    await completePersonalInformation(page);

    // --------------------------------------------------------
    // PAYMENT
    // --------------------------------------------------------

    await waitForPayment(page);

    await selectVirtualAccount(page);

    await selectBCA(page);

    await confirmBCA(page);

    // --------------------------------------------------------
    // CHECKOUT
    // --------------------------------------------------------

    await waitForCheckout(page);

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      "✅ PROSES OTOMATIS SELESAI"
    );
    console.log(
      "=========================================="
    );
    console.log(
      `📍 URL: ${page.url()}`
    );
    console.log("");
    console.log(
      "⚠️ Bot berhenti di halaman Checkout."
    );
    console.log(
      "Lakukan pembayaran secara manual."
    );

    // Tahan browser agar tetap terbuka
    await new Promise(() => {});
  } catch (error) {
    console.log("");
    console.log(
      "❌ TERJADI ERROR"
    );

    console.error(error);

    await screenshot(
      page,
      `error-${Date.now()}.png`
    );

    console.log("");
    console.log(
      `📍 URL terakhir: ${page.url()}`
    );

    await context.close();
    await browser.close();
  }
}

main();
