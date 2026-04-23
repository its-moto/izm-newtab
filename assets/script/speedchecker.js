async function measureSpeedPrecise() {
  const display = document.getElementById('speed-display');
  display.innerText = "Measuring...";

  // 【修正】信頼できるテスト用URLに変更
  // Cloudflareのスピードテスト用エンドポイント（1MB程度）
  const testUrl = "https://speed.cloudflare.com/__down?bytes=1048576"; 
  
  try {
    const startTime = performance.now();
    const response = await fetch(testUrl, { cache: 'no-store' });
    
    if (!response.ok) throw new Error('Network response was not ok');

    const reader = response.body.getReader();
    let loadedBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loadedBytes += value.byteLength;
      
      if (performance.now() - startTime > 1500) { // 1.5秒で打ち切り
        break; 
      }
    }

    const endTime = performance.now();
    const durationInSeconds = (endTime - startTime) / 1000;

    const bitsLoaded = loadedBytes * 8;
    const speedMbps = (bitsLoaded / durationInSeconds / 1_000_000).toFixed(2);

    display.innerText = `${speedMbps} Mbps`;

  } catch (e) {
    console.error("Fetch Error:", e);
    display.innerText = "Error: Connection blocked";
  }
}
measureSpeedPrecise();