// Redirect if already logged in
if (localStorage.getItem('token')) window.location.href = 'dashboard.html';

const LOGIN_API = 'https://wrh5tot0a8.execute-api.ap-southeast-1.amazonaws.com/prod';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(LOGIN_API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      window.location.href = 'dashboard.html';
    } else {
      document.getElementById('error').textContent = data.error || 'Login failed';
      document.getElementById('error').classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('error').textContent = 'Cannot connect to API';
    document.getElementById('error').classList.remove('hidden');
  }
});
