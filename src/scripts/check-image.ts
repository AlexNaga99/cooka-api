/**
 * Testa a análise de imagem (Google Vision SafeSearch) com arquivos locais, sem criar receita
 * nem tocar no Firestore:
 *
 *   npx ts-node src/scripts/check-image.ts caminho/da/imagem.jpg [outra.png ...]
 *
 * Mostra as probabilidades que o Vision devolveu e o veredito que o app aplicaria
 * (approved = publica, review = revisão manual, rejected = reprova).
 * Requer GOOGLE_APPLICATION_CREDENTIALS no .env (a Vision API precisa estar habilitada no projeto).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { VisionService } from '../moderation/vision.service';

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Uso: npx ts-node src/scripts/check-image.ts <imagem> [...]');
    process.exit(1);
  }
  const vision = new VisionService();
  for (const f of files) {
    const { safe, verdict } = await vision.analyzeBytes(readFileSync(f));
    console.log(`\n${f}`);
    console.log(
      `  adult=${safe.adult} racy=${safe.racy} violence=${safe.violence} medical=${safe.medical}`,
    );
    console.log(`  -> veredito: ${verdict.toUpperCase()}`);
  }
}

main().catch((e) => {
  console.error('Falhou:', (e as Error).message);
  process.exit(1);
});
