(() => {
  if (window.__JOB_AUTOFILL_PAGE__) return;

  function scanUnansweredQuestions() {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);

      function onMsg(ev) {
        const msg = ev.data;
        if (!msg || msg.source !== 'JOB_AUTOFILL_CONTENT') return;
        if (msg.type !== 'SCAN_UNANSWERED_RESULT') return;
        if (msg.requestId !== id) return;

        window.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(msg.payload);
      }

      window.addEventListener('message', onMsg);

      window.postMessage(
        { source: 'JOB_AUTOFILL_PAGE', type: 'SCAN_UNANSWERED', requestId: id },
        '*'
      );

      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error('scan timeout'));
      }, 3000);
    });
  }

  window.__JOB_AUTOFILL_PAGE__ = {
    scanUnansweredQuestions,
  };
})();
