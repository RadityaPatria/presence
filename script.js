// Ganti dengan URL Web App Google Apps Script Anda setelah di-deploy
const API_URL = "https://script.google.com/macros/s/AKfycbwRWRN2Nn3vvDzWNO8IYinc449oZcnyCCC3NJmzqTX0gSnOyFpEzo4Giap3nYEwg39M4g/exec"; 

// const COURSE_ID = "CC-101"; // ID Mata Kuliah Cloud Computing
// const SESSION_ID = "SES-01"; // ID Sesi perkuliahan hari ini

// Ambil elemen dari DOM (HTML)
const qrImage = document.getElementById('qr-image');
const timeLeftSpan = document.getElementById('time-left');
const listBelum = document.getElementById('list-belum');
const listSudah = document.getElementById('list-sudah');
const countBelum = document.getElementById('count-belum');
const countSudah = document.getElementById('count-sudah');

// Daftar data mahasiswa statis (Karena backend belum memiliki endpoint untuk mengambil list seluruh mahasiswa)
const students = [
  { id: "101123001", name: "Ahmad Budi" },
  { id: "101123002", name: "Siti Aminah" },
  { id: "101123003", name: "Fajar Pratama" }
];

let qrInterval;

// 1. Fungsi Generate Token & Tampilkan QR Code
async function generateQR() {
  // Ambil nilai terbaru dari inputan HTML
  const currentCourseId = document.getElementById('input-course').value;
  const currentSessionId = document.getElementById('input-session').value;

  try {
    const fetchUrl = `${API_URL}?path=presence/qr/generate`;
    
    const response = await fetch(fetchUrl, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({
        course_id: currentCourseId, // Gunakan variabel dinamis
        session_id: currentSessionId, // Gunakan variabel dinamis
        timestamp: new Date().toISOString()
      }),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    
    const result = await response.json();
    
    if (result.ok) {
      const token = result.data.qr_token;
      qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${token}`;
      startTimer(30); 
    }
  } catch (error) {
    console.error("Gagal generate QR:", error);
  }
}

// 2. Fungsi Hitung Mundur (Timer)
function startTimer(seconds) {
  clearInterval(qrInterval);
  let timeLeft = seconds;
  timeLeftSpan.innerText = timeLeft;

  qrInterval = setInterval(() => {
    timeLeft--;
    timeLeftSpan.innerText = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(qrInterval);
      generateQR(); // Otomatis generate QR baru saat waktu habis
    }
  }, 1000);
}

// 3. Fungsi Polling: Cek Status Mahasiswa ke Backend
async function checkStudentStatus() {
  // Ambil nilai terbaru dari inputan HTML
  const currentCourseId = document.getElementById('input-course').value;
  const currentSessionId = document.getElementById('input-session').value;

  let htmlBelum = "";
  let htmlSudah = "";
  let totalBelum = 0;
  let totalSudah = 0;
  let isApiError = false;

  for (const student of students) {
    try {
      // Masukkan variabel dinamis ke URL Fetch
      const response = await fetch(`${API_URL}?path=presence/status&user_id=${student.id}&course_id=${currentCourseId}&session_id=${currentSessionId}`);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const result = await response.json();
      const isCheckedIn = result.ok && result.data.status === "checked_in";
      
      const listItem = `
        <li class="list-item">
          <div class="student-info">
            <span class="student-id">${student.id}</span>
            <span class="student-name">${student.name}</span>
          </div>
          <span class="status-badge ${isCheckedIn ? 'success' : 'pending'}">
            ${isCheckedIn ? 'Hadir' : 'Belum'}
          </span>
        </li>
      `;

      if (isCheckedIn) {
        htmlSudah += listItem;
        totalSudah++;
      } else {
        htmlBelum += listItem;
        totalBelum++;
      }
    } catch (error) {
      console.error(`Gagal cek status ${student.name}:`, error);
      isApiError = true;
    }
  }

  if (!isApiError) {
    listBelum.innerHTML = htmlBelum;
    listSudah.innerHTML = htmlSudah;
    countBelum.innerText = totalBelum;
    countSudah.innerText = totalSudah;
  }
}

// 4. Tab Navigasi Sederhana
document.querySelectorAll('.tab').forEach((tab, index) => {
  tab.addEventListener('click', () => {
    // Reset tab active
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Sembunyikan/Tampilkan list sesuai tab yang diklik
    if(index === 0) {
      listBelum.style.display = 'block';
      listSudah.style.display = 'none';
    } else {
      listBelum.style.display = 'none';
      listSudah.style.display = 'block';
    }
  });
});

// Inisialisasi saat halaman web pertama kali dimuat
window.onload = () => {
  // Sembunyikan list "Sudah Absen" secara default
  listSudah.style.display = 'none';
  
  generateQR();
  checkStudentStatus();
  
  // Lakukan polling otomatis (cek absensi) setiap 5 detik
  setInterval(checkStudentStatus, 5000);
};