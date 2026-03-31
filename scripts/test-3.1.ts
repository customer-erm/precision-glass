import WebSocket from 'ws';

const API_KEY = process.env.GEMINI_API_KEY || '';

async function testModel(apiVersion: string) {
  const model = 'gemini-3.1-flash-live-preview';
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
  console.log(`\n${apiVersion} + ${model} (AUDIO):`);

  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => { console.log(`  ✗ timeout`); ws.close(); resolve(false); }, 20000);

    ws.on('open', () => {
      console.log('  ⟳ ws open, sending setup...');
      ws.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
          systemInstruction: { parts: [{ text: 'You are a helpful assistant. Greet the user briefly.' }] },
        },
      }));
    });

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());

      if (msg.setupComplete) {
        console.log(`  ✓ SETUP COMPLETE!`);
        // Use realtimeInput with text (per 3.1 migration guide)
        console.log(`  ⟳ sending realtimeInput text...`);
        ws.send(JSON.stringify({
          realtimeInput: {
            text: 'Hello, say hi briefly.',
          },
        }));
      }

      if (msg.serverContent?.modelTurn?.parts) {
        for (const p of msg.serverContent.modelTurn.parts) {
          if (p.inlineData) {
            console.log(`  ✓ GOT AUDIO! (${p.inlineData.data.length} bytes, mime: ${p.inlineData.mimeType})`);
          }
          if (p.text) {
            console.log(`  ✓ TEXT: "${p.text.substring(0, 100)}"`);
          }
        }
      }

      if (msg.serverContent?.outputTranscription) {
        console.log(`  ✓ TRANSCRIPT: "${msg.serverContent.outputTranscription.text}"`);
      }

      if (msg.serverContent?.turnComplete) {
        console.log(`  ✓ Turn complete — WORKING!`);
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      }

      // Log any errors
      if (msg.error) {
        console.log(`  ✗ Error:`, JSON.stringify(msg.error).substring(0, 200));
      }
    });

    ws.on('close', (_code: number, reason: Buffer) => {
      const r = reason.toString();
      if (r) console.log(`  close: ${r.substring(0, 200)}`);
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
    if (await testModel(ver)) {
      console.log(`\n✓ WORKING with ${ver}`);
      process.exit(0);
    }
  }
  console.log('\n✗ Nothing worked');
  process.exit(1);
}

main();
