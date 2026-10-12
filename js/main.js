(() => {
  const menuButton = document.querySelector('[data-menu-toggle]');
  const navigation = document.querySelector('[data-site-nav]');

  const closeMenu = () => {
    navigation?.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  };

  menuButton?.addEventListener('click', () => {
    const isOpen = navigation?.classList.toggle('is-open') ?? false;
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  navigation?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  const currentPath = window.location.pathname.replace(/\/$/, '/index.html');
  const currentFile = currentPath.split('/').pop();
  const currentSection = currentPath.includes('/homework/')
    ? 'homework'
    : currentFile === 'homework.html'
      ? 'homework'
      : currentFile === 'about.html'
        ? 'about'
        : 'home';

  document.querySelectorAll('[data-nav-section]').forEach((link) => {
    if (link.dataset.navSection === currentSection) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('.code-block pre').forEach((pre) => {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.type = 'button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText ?? pre.innerText;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy unavailable';
      }
      window.setTimeout(() => {
        button.textContent = 'Copy';
      }, 1800);
    });
    pre.parentElement?.append(button);
  });

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  document.body.classList.add('page-ready');
})();