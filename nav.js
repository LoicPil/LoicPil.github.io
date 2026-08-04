// Handles the mobile nav menu: toggle open/close, keep aria-expanded in sync,
// and close the menu on link click, outside click, or Escape.

function toggleNav() {
  const nav = document.getElementById('navLinks');
  const toggle = document.querySelector('.nav-toggle');
  const isOpen = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(isOpen));
}

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('navLinks');
  const toggle = document.querySelector('.nav-toggle');

  const closeNav = () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('click', (event) => {
    const clickedOutside = !nav.contains(event.target) && !toggle.contains(event.target);
    if (clickedOutside && nav.classList.contains('open')) {
      closeNav();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      closeNav();
    }
  });
});
