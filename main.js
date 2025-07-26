// ==== MQTT CONFIG ====
const mqtt_host = "wss://3e126851189a4b7d9ae59215d2ab14b7.s1.eu.hivemq.cloud:8884/mqtt";
const mqtt_user = "hivemq.webclient.1753534095756";
const mqtt_pass = "4?Qx<bhj:;P328EKeNJc";
const topic_status = "esp8266/status";
const topic_control = "esp8266/control";
const topic_button = "esp8266/button";

// ========= Theme =========
// ... (Giữ theme cũ nếu có, không ảnh hưởng code chính)

// ========= Trạng thái =========
let states = [false, false, false]; // trạng thái 3 led
let sending = false;
let countdown = 0;
let countdownTimer = null;

// === Quản lý lịch sử nút nhấn
let buttonHistory = [];

// ==== Cập nhật UI =========
function updateButtons() {
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById('btn' + (i + 1));
    btn.disabled = sending;
    btn.className = states[i] ? 'btn btn-tat' : 'btn btn-bat';
    btn.textContent = (states[i] ? 'TẮT' : 'BẬT') + ` LED ${i + 1}`;
  }
}
function updateStatus(msg) {
  document.getElementById('status').textContent = msg;
}
function renderButtonHistory() {
  let table = "<tr><th>#</th><th>Giờ nhấn</th></tr>";
  buttonHistory.forEach((item, idx) => {
    table += `<tr><td>${idx + 1}</td><td>${item.time}</td></tr>`;
  });
  document.getElementById('button-history').innerHTML = table;
}

// ==== MQTT kết nối - subscribe ====  
const mqtt_client = mqtt.connect(mqtt_host, {
  username: mqtt_user,
  password: mqtt_pass,
});

mqtt_client.on('connect', function () {
  document.getElementById('mqtt-status').textContent = "Đã kết nối";
  mqtt_client.subscribe(topic_status);
  mqtt_client.subscribe(topic_button);
  updateStatus("Đã kết nối MQTT, chờ thiết bị phản hồi...");
});
mqtt_client.on('close', function () {
  document.getElementById('mqtt-status').textContent = "Mất kết nối!";
  updateStatus("Mất kết nối MQTT...");
});
mqtt_client.on('error', function () {
  document.getElementById('mqtt-status').textContent = "Lỗi Broker!";
  updateStatus("Có lỗi Broker MQTT.");
});
setInterval(()=>{
  const now = new Date();
  document.getElementById('mqtt-time').textContent = now.toLocaleTimeString('vi-VN', {hour12: false});
},1000);

mqtt_client.on('message', function (topic, message) {
  if (topic === topic_status) {
    let data;
    try { data = JSON.parse(message.toString()); } catch { return; }
    if(Array.isArray(data.leds)){
      for (let i = 0; i < 3; i++) {
        states[i] = !!data.leds[i];
        document.getElementById('state'+(i+1)).textContent = states[i] ? 'ON' : 'OFF';
        document.getElementById('state'+(i+1)).className = 'state-indicator '+(states[i]?'on':'off');
      }
      updateButtons();
    }
    if(data.adc !== undefined) updateAdcBoth(Number(data.adc));
  } else if (topic === topic_button) {
    // Lịch sử nút nhấn ESP
    const now = new Date();
    buttonHistory.unshift({
      time: now.toLocaleTimeString('vi-VN', {hour12: false}),
      millis: (JSON.parse(message).millis) || 0
    });
    if (buttonHistory.length > 10) buttonHistory.pop();
    renderButtonHistory();
  }
});

// Gửi lệnh điều khiển LED
function sendCommand() {
  mqtt_client.publish(topic_control, JSON.stringify({ leds: states.map(x=>x?1:0) }));
}
// ==== Nút điều khiển ====  
function toggleButton(index) {
  if (sending) return; // nếu muốn tránh bấm liên tục
  states[index] = !states[index];
  updateButtons();
  sendCommand();
  
  let action = states[index] ? "BẬT" : "TẮT";
  updateStatus(`Đã gửi lệnh ${action} nút ${index + 1}.`);
}



// ==== Biểu đồ & Gauge ADC ====  
let adcData = [];
const adcMaxLength = 30;
const adcLineCtx = document.getElementById('adcLineChart').getContext('2d');
const adcGaugeCtx = document.getElementById('adcGauge').getContext('2d');
let adcLineChart = new Chart(adcLineCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{ label: 'ADC', backgroundColor: 'rgba(241,74,52,.10)', borderColor: '#e22929', borderWidth: 2, data: [], pointRadius: 4, pointBackgroundColor: '#e22929', tension: 0 }]
  },
  options: {
    plugins: { legend: { display: false }, title: { display: true, text: 'ADC Value', color: '#fff', font: { size: 18, weight: 'bold' } } },
    scales: {
      x: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } },
      y: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } }
    }
  }
});
function drawAdcGauge(value) {
  const ctx = adcGaugeCtx;
  ctx.clearRect(0, 0, 220, 220);
  const centerX = 110, centerY = 110, radius = 85;
  ctx.save();
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.strokeStyle = i<3 ? "#1ad525" : (i<7 ? "#1a87e9" : "#ed3d3d");
    ctx.lineWidth = 15;
    const startA = Math.PI * (1 + i*1.9/10);
    const endA = Math.PI * (1 + (i+1)*1.9/10);
    ctx.arc(centerX, centerY, radius, startA, endA, false);
    ctx.stroke();
  }
  const percent = Math.max(0, Math.min(1, value / 1024));
  const angle = Math.PI * (1 + 1.9*percent);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(radius-12, 0); ctx.lineWidth = 2;
  ctx.strokeStyle = "#e22929";
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI*2);
  ctx.fillStyle="#4a475a";
  ctx.fill(); ctx.restore();
  ctx.font="12px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
  for (let v=0;v<=1024;v+=128) {
    const a = Math.PI * (1 + 1.9*v/1024);
    const tx = centerX + Math.cos(a)*(radius-20);
    const ty = centerY + Math.sin(a)*(radius-20);
    ctx.fillStyle = "#fff";
    ctx.fillText(v, tx, ty);
  }
}
function updateAdcBoth(newVal) {
  const now = new Date();
  const label = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  adcData.push({x: label, y: newVal});
  if (adcData.length > adcMaxLength) adcData.shift();
  adcLineChart.data.labels = adcData.map(v=>v.x);
  adcLineChart.data.datasets[0].data = adcData.map(v=>v.y);
  adcLineChart.update();
  drawAdcGauge(newVal);
  document.getElementById('adcGaugeValue').textContent = newVal;
}
window.onload = function () {
  updateButtons();
  renderButtonHistory();
};
