const API_URL = window.API_URL || localStorage.getItem('api_url') || 'https://YOUR_API_GW_ID.execute-api.ap-southeast-1.amazonaws.com/prod';

async function apiCall(path, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  return res.json();
}

async function getStatus() { return apiCall('/status'); }
async function ec2Action(id, action) { return apiCall('/ec2/action', 'POST', { id, action }); }
async function ecsAction(cluster, service, action) { return apiCall('/ecs/action', 'POST', { cluster, service, action }); }
async function rdsAction(action) { return apiCall('/rds/action', 'POST', { action }); }
async function listLambda() { return apiCall('/lambda/list'); }
async function invokeLambda(name, payload = {}) { return apiCall('/lambda/invoke', 'POST', { name, payload }); }
