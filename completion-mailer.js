(() => {
  "use strict";
  const script = document.currentScript;
  const toolName = script?.dataset.toolName || document.title;
  const endpoint = "https://script.google.com/macros/s/AKfycbxslbbwMmMlA5IRUw0QTiCMHthdFzgFgpQc1rLcEzVvt25p77qZWYCd86PDwRQX6_eK/exec";
  const completionPattern = /print|pdf|email|e-mail|export|download|send results|complete|finish|analy[sz]e|generate report|save results/i;
  let lastSignature = "";

  function addCustomerField() {
    if (document.querySelector('[name="customerName"]')) return;
    const wrap = document.createElement("section");
    wrap.className = "qip-customer-field";
    wrap.setAttribute("aria-label", "Customer information");
    wrap.innerHTML = '<label for="qipCustomerName"><strong>Customer Name <span aria-hidden="true">*</span></strong></label><input id="qipCustomerName" name="customerName" type="text" required autocomplete="organization" placeholder="Enter customer name">';
    Object.assign(wrap.style, {padding:"16px",margin:"16px auto",maxWidth:"1200px",border:"2px solid #1f5f8b",borderRadius:"8px",background:"#f7fbff",boxSizing:"border-box"});
    const input = wrap.querySelector("input");
    Object.assign(input.style, {display:"block",width:"100%",marginTop:"8px",padding:"10px 12px",border:"1px solid #789",borderRadius:"5px",font:"inherit",boxSizing:"border-box"});
    const target = document.querySelector("main, form, .page-shell, .app-shell") || document.body;
    target.insertBefore(wrap, target.firstChild);
  }

  function customerInput() {
    return document.querySelector('[name="customerName"]');
  }

  function requireCustomer() {
    const input = customerInput();
    if (input && input.value.trim()) return true;
    if (input) {
      input.setCustomValidity("Customer name is required.");
      input.reportValidity();
      input.addEventListener("input", () => input.setCustomValidity(""), {once:true});
      input.focus();
    }
    return false;
  }

  function collectToolData() {
    const fields = {};
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      if (!el.name && !el.id) return;
      if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
      if (el.type === "file") {
        fields[el.name || el.id] = Array.from(el.files || []).map((f) => f.name);
      } else {
        fields[el.name || el.id] = el.value;
      }
    });
    return {
      pageTitle: document.title,
      pageUrl: location.href,
      fields,
      visibleResults: Array.from(document.querySelectorAll("table, [id*='result'], [class*='result'], canvas"))
        .slice(0, 30).map((el) => el.innerText || el.getAttribute("aria-label") || el.tagName).filter(Boolean)
    };
  }

  function sendCompletion() {
    if (!requireCustomer()) return;
    const customerName = customerInput().value.trim();
    const payload = JSON.stringify({customerName, toolName, toolData: collectToolData()});
    const signature = customerName + "|" + payload.length + "|" + payload.slice(-120);
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], {type:"text/plain;charset=UTF-8"}));
      } else {
        fetch(endpoint, {method:"POST", mode:"no-cors", keepalive:true, headers:{"Content-Type":"text/plain;charset=UTF-8"}, body:payload});
      }
    } catch (_) {}
  }

  addCustomerField();
  document.addEventListener("submit", (event) => {
    if (!requireCustomer()) event.preventDefault();
    else sendCompletion();
  }, true);
  document.addEventListener("click", (event) => {
    const control = event.target.closest("button, a, input[type='button'], input[type='submit']");
    if (!control) return;
    const label = [control.textContent, control.value, control.id, control.getAttribute("data-action"), control.getAttribute("aria-label"), control.href].filter(Boolean).join(" ");
    if (!completionPattern.test(label)) return;
    if (!requireCustomer()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    sendCompletion();
  }, true);
  window.addEventListener("beforeprint", sendCompletion);
})();