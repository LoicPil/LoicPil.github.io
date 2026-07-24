// Handles the mobile nav menu toggle and auto-closes it after a link is clicked
function toggleNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#navLinks a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navLinks').classList.remove('open');
    });
  });
});
