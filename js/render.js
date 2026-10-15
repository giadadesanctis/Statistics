(() => {
  const homework = Array.isArray(window.homeworkData) ? window.homeworkData : [];
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

  const formatDate = (value) => {
    const [year, month, day] = String(value).split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  };

  const renderCard = (item) => {
    const homeworkNumber = Number.parseInt(item.number, 10);
    const heading = Number.isNaN(homeworkNumber) ? escapeHtml(item.number) : String(homeworkNumber);
    const label = item.label ? escapeHtml(item.label) : `Homework ${heading}`;
    const title = escapeHtml(item.title);
    const cardLink = item.file
      ? `<a class="homework-card-link" href="${escapeHtml(item.file)}" aria-label="Open ${label}: ${title}"></a>`
      : '';
    const cardClass = item.file ? 'homework-card homework-card--linked' : 'homework-card';

    return `<article class="${cardClass}">
      ${cardLink}
      <div class="homework-card-meta">
        <span class="homework-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time></span>
      </div>
      <h3>${label}</h3>
      <p class="homework-card-subtitle">${title}</p>
      <p>${escapeHtml(item.description)}</p>
    </article>`;
  };

  document.querySelectorAll('[data-homework-list]').forEach((list) => {
    const limit = Number(list.dataset.limit) || homework.length;
    list.innerHTML = homework.slice(0, limit).map(renderCard).join('')
      || '<p class="empty-state">No homework has been posted yet.</p>';
  });

  const latest = homework.find((item) => item.file);
  const latestLink = document.querySelector('[data-latest-homework]');
  if (latest && latestLink) {
    latestLink.href = latest.file;
    const homeworkNumber = Number.parseInt(latest.number, 10);
    const latestLabel = latest.label ? escapeHtml(latest.label) : `Homework ${homeworkNumber}`;
    latestLink.innerHTML = `View ${latestLabel}: ${escapeHtml(latest.title)} <span class="button-arrow" aria-hidden="true">→</span>`;
  }

  if (window.renderMathInElement) {
    document.querySelectorAll('[data-render-math]').forEach((content) => {
      window.renderMathInElement(content, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    });
  }

  if (window.hljs) {
    document.querySelectorAll('pre code').forEach((block) => window.hljs.highlightElement(block));
  }
})();