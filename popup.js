/*
 * Copyright 2026 Sando
 * Licensed under the Apache License, Version 2.0
 */

const popupStatusDot = document.getElementById('popup-status-dot');
const popupStatusText = document.getElementById('popup-status-text');
const openBtn = document.getElementById('open-btn');

async function checkSession() {
  try {
    let authToken = await chrome.cookies.get({ url: 'https://x.com', name: 'auth_token' });
    if (!authToken) {
      authToken = await chrome.cookies.get({ url: 'https://twitter.com', name: 'auth_token' });
    }
    
    if (authToken && authToken.value) {
      popupStatusDot.style.backgroundColor = '#10b981'; // Green
      popupStatusText.textContent = 'Active Session';
      popupStatusText.style.color = '#e7e9ea';
    } else {
      popupStatusDot.style.backgroundColor = '#f43f5e'; // Red
      popupStatusText.textContent = 'No Active Session';
      popupStatusText.style.color = '#f43f5e';
    }
  } catch (err) {
    popupStatusDot.style.backgroundColor = '#f43f5e';
    popupStatusText.textContent = 'Disconnected';
  }
}

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

checkSession();
