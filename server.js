// Substituir a função startClickDetection por esta:
function startUSBDetection() {
  console.log('🔌 Monitorando conexões USB de mouse...');

  let previousDeviceCount = 0;
  
  try {
    const initialDevices = fs.readdirSync('/dev/input').filter(file => file.startsWith('event'));
    previousDeviceCount = initialDevices.length;
    console.log(`📋 Dispositivos iniciais: ${previousDeviceCount} eventos`);
  } catch (error) {
    console.error('❌ Erro inicial:', error.message);
  }

  setInterval(() => {
    if (usbDetected) return;
    
    try {
      const currentDevices = fs.readdirSync('/dev/input').filter(file => file.startsWith('event'));
      const currentCount = currentDevices.length;
      
      // Se aumentou o número de dispositivos, algo foi conectado
      if (currentCount > previousDeviceCount) {
        usbDetected = true;
        
        const usbData = {
          timestamp: new Date().toISOString(),
          type: 'mouse_click',
          button: 'left',
          message: `Novo dispositivo USB conectado (${currentCount} total)`
        };

        clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(usbData));
          }
        });

        console.log(`🔌 DISPOSITIVO USB CONECTADO! Total: ${currentCount} - Pausando por 10 segundos...`);
        
        if (resetTimeout) clearTimeout(resetTimeout);
        resetTimeout = setTimeout(resetUSBDetection, 10000);
      }
      
      previousDeviceCount = currentCount;
      
    } catch (error) {
      console.error('❌ Erro ao monitorar:', error.message);
    }
  }, 1000);
}
