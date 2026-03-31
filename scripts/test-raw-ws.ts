import WebSocket from 'ws';

const API_KEY = 'AIzaSyACRCzxmxeO3lJ6v9Ss4P6yd9ncHzV71VA';

async function testModel(model: string, apiVersion: string) {
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
  console.log(`\n${apiVersion} + ${model} (AUDIO modality):`);

  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => { console.log(`  ✗ timeout`); ws.close(); resolve(false); }, 15000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
        },
      }));
    });

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());

      if (msg.setupComplete) {
        console.log(`  ✓ SETUP COMPLETE!`);
        // Send text input to trigger the model to speak
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: 'Say hello briefly.' }] }],
            turnComplete: true,
          },
        }));
        console.log(`  ⟳ sent text prompt...`);
      }

      if (msg.serverContent?.modelTurn?.parts) {
        for (const p of msg.serverContent.modelTurn.parts) {
          if (p.inlineData) {
            console.log(`  ✓ GOT AUDIO DATA! (${p.inlineData.data.length} bytes base64, mime: ${p.inlineData.mimeType})`);
          }
          if (p.text) {
            console.log(`  ✓ GOT TEXT: "${p.text}"`);
          }
        }
      }

      if (msg.serverContent?.outputTranscription) {
        console.log(`  ✓ TRANSCRIPTION: "${msg.serverContent.outputTranscription.text}"`);
      }

      if (msg.serverContent?.turnComplete) {
        console.log(`  ✓ Turn complete — FULLY WORKING!`);
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      }
    });

    ws.on('close', (_code: number, reason: Buffer) => {
      const r = reason.toString();
      if (r) console.log(`  close: ${r.substring(0, 150)}`);
      clearTimeout(timeout);
      resolve(false);
    });

    ws.on('error', (err: Error) => {
      console.log(`  ✗ ${err.message}`);
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function main() {
  for (const ver of ['v1alpha', 'v1beta']) {
    for (const model of ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest']) {
      if (await testModel(model, ver)) {
        console.log(`\n✓ USE: apiVersion="${ver}", model="${model}"`);
        process.exit(0);
      }
    }
  }
  console.log('\n✗ Nothing worked');
  process.exit(1);
}

main();
