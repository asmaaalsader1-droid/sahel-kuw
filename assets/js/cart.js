/**
 * cart.js — نظام السلة الموحّد (تخزين ذكي في متصفح العميل)
 * -----------------------------------------------------------
 * يحفظ سلة العميل في localStorage لتبقى محفوظة بين الصفحات والجلسات.
 * تشاركه صفحات: index.html (المتجر) و cartepage.html (السلة).
 *
 * بنية السلة: مصفوفة منتجات، كل منتج:
 *   { name, desc, price (string), img, qty (int) }
 * المفتاح المستخدم: localStorage['cart']
 */
(function () {
  const CART_KEY = 'cart';

  function safeParse(str, fallback) {
    try { return JSON.parse(str) || fallback; }
    catch (e) { return fallback; }
  }

  /** قراءة السلة من localStorage */
  window.CartGet = function () {
    return safeParse(localStorage.getItem(CART_KEY), []);
  };

  /** حفظ السلة كاملة في localStorage */
  window.CartSave = function (cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    catch (e) {}
  };

  /** العثور على منتج في السلة بالاسم (المعرف الفريد) */
  function findIndex(cart, name) {
    return cart.findIndex(function (p) { return p.name === name; });
  }

  /** إضافة منتج إلى السلة (أو زيادة الكمية إن كان موجوداً) */
  window.CartAdd = function (product, qty) {
    qty = qty || 1;
    const cart = window.CartGet();
    const idx = findIndex(cart, product.name);
    if (idx >= 0) {
      cart[idx].qty += qty;
    } else {
      cart.push({
        name: product.name,
        desc: product.desc || '',
        price: product.price,
        img: product.img,
        qty: qty
      });
    }
    window.CartSave(cart);
    return cart;
  };

  /** ضبط كمية منتج بقيمة مطلقة (يحذفه إن وصل صفر) */
  window.CartSetQty = function (name, qty) {
    let cart = window.CartGet();
    const idx = findIndex(cart, name);
    if (qty <= 0) {
      if (idx >= 0) cart.splice(idx, 1);
    } else {
      if (idx >= 0) {
        cart[idx].qty = qty;
      } else {
        cart.push({ name: name, desc: '', price: '0', img: '', qty: qty });
      }
    }
    window.CartSave(cart);
    return cart;
  };

  /** زيادة/نقصان كمية منتج بمقدار change (يحذفه إن وصل صفر) */
  window.CartChangeQty = function (name, change) {
    const cart = window.CartGet();
    const idx = findIndex(cart, name);
    if (idx < 0) {
      if (change > 0) {
        cart.push({ name: name, desc: '', price: '0', img: '', qty: change });
      }
    } else {
      cart[idx].qty += change;
      if (cart[idx].qty <= 0) cart.splice(idx, 1);
    }
    window.CartSave(cart);
    return cart;
  };

  /** حذف منتج من السلة بالاسم */
  window.CartRemove = function (name) {
    let cart = window.CartGet();
    const idx = findIndex(cart, name);
    if (idx >= 0) cart.splice(idx, 1);
    window.CartSave(cart);
    return cart;
  };

  /** تفريغ السلة كاملة */
  window.CartClear = function () {
    window.CartSave([]);
  };

  /** عدد القطع الإجمالي في السلة */
  window.CartCount = function () {
    return window.CartGet().reduce(function (sum, p) { return sum + (p.qty || 0); }, 0);
  };

  /** الإجمالي المالي للسلة (رقم) */
  window.CartTotal = function () {
    return window.CartGet().reduce(function (sum, p) {
      return sum + (parseFloat(p.price) || 0) * (p.qty || 0);
    }, 0);
  };

  /** تنسيق مبلغ بصيغة الدينار الكويتي */
  window.CartFormatKWD = function (num) {
    return (num || 0).toFixed(3) + ' د.ك';
  };
})();