import { GoogleGenAI } from '@google/genai';

const API_KEY = 'AIzaSyACRCzxmxeO3lJ6v9Ss4P6yd9ncHzV71VA';
const MODEL = 'gemini-2.0-flash-live-001';

async function testWithVersion(apiVersion: string): Promise<boolean> {
  console.log(`\nTesting with apiVersion="${apiVersion}", model="${MODEL}"...`);

  const ai = new GoogleGenAI({ apiKey: API_KEY, apiVersion });

  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => {
      console.log(`  ✗ timeout`);
      resolve(false);
    }, 10000);

    try {
      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: ['TEXT'],
        },
        callbacks: {
          onopen: () => console.log(`  ⟳ ws open`),
          onmessage: (msg: any) => {
            console.log(`  ✓ message:`, JSON.stringify(msg).substring(0, 200));
            if (msg.setupComplete) {
              console.log(`  ✓ setup complete! Sending...`);
              session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: 'Say hello in one word.' }] }],
                turnComplete: true,
              });
            }
            const c = msg.serverContent;
            if (c?.modelTurn?.parts) {
              for (const p of c.modelTurn.parts) {
                if (p.text) {
                  console.log(`  ✓ RESPONSE: "${p.text}"`);
                  clearTimeout(timeout);
                  session.close();
                  resolve(true);
                  return;
                }
              }
            }
          },
          onerror: (e: any) => {
            console.log(`  ✗ error:`, e?.message || JSON.stringify(e).substring(0, 200));
            clearTimeout(timeout);
            resolve(false);
          },
          onclose: () => {
            console.log(`  - closed`);
          },
        },
      });
    } catch (err: any) {
      console.log(`  ✗ connect failed: ${err.message?.substring(0, 200)}`);
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

async function main() {
  // Try different API versions
  for (const version of ['v1alpha', 'v1beta', 'v1']) {
    if (await testWithVersion(version)) {
      console.log(`\n✓ WORKING: apiVersion="${version}", model="${MODEL}"`);
      process.exit(0);
    }
  }

  // Also try v1alpha with newer models
  console.log('\n--- Trying v1alpha with different models ---');
  const ai = new GoogleGenAI({ apiKey: API_KEY, apiVersion: 'v1alpha' });

  for (const model of ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest', 'gemini-2.5-flash']) {
    console.log(`\nTesting v1alpha + ${model}...`);
    const works = await new Promise<boolean>(async (resolve) => {
      const timeout = setTimeout(() => { resolve(false); }, 8000);
      try {
        const session = await ai.live.connect({
          model,
          config: { responseModalities: ['TEXT'] },
          callbacks: {
            onopen: () => console.log(`  ⟳ open`),
            onmessage: (msg: any) => {
              console.log(`  msg:`, JSON.stringify(msg).substring(0, 150));
              if (msg.setupComplete) {
                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: 'Say hi' }] }],
                  turnComplete: true,
                });
              }
              if (msg.serverContent?.modelTurn?.parts?.[0]?.text) {
                console.log(`  ✓ "${msg.serverContent.modelTurn.parts[0].text}"`);
                clearTimeout(timeout);
                session.close();
                resolve(true);
              }
            },
            onerror: (e: any) => { console.log(`  ✗`, e?.message); clearTimeout(timeout); resolve(false); },
            onclose: () => console.log(`  - closed`),
          },
        });
      } catch (e: any) { console.log(`  ✗`, e.message?.substring(0, 100)); clearTimeout(timeout); resolve(false); }
    });
    if (works) {
      console.log(`\n✓ WORKING: v1alpha + ${model}`);
      process.exit(0);
    }
  }

  console.log('\n✗ Nothing worked');
  process.exit(1);
}

main();
