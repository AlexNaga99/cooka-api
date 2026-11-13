/** Textos legais do Cooka. Mantidos em sincronia com o app (lib/features/legal). Revisar com advogado. */
export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

export type Lang = 'pt' | 'en';

const TERMS_PT: LegalSection[] = [
  { title: '1. Aceite dos termos', body: 'Ao criar uma conta ou usar o Cooka, você concorda com estes Termos de Uso e com a Política de Privacidade. Se não concordar, não use o app.' },
  { title: '2. Conta e idade mínima', body: 'Você deve ter pelo menos 13 anos. Menores de 18 anos precisam do consentimento de um responsável. Você é responsável pelas informações da sua conta e por tudo o que acontece nela. Mantenha seus dados de acesso em segurança.' },
  { title: '3. Seu conteúdo', body: 'Receitas, fotos, vídeos, comentários e avaliações que você publica são seus. Ao publicar, você nos autoriza, de forma gratuita e não exclusiva, a exibir, armazenar e distribuir esse conteúdo dentro do Cooka para que o serviço funcione. Você declara ter os direitos sobre o que publica. Você pode apagar seu conteúdo ou sua conta a qualquer momento.' },
  { title: '4. Regras de conduta', body: 'Não é permitido publicar conteúdo ilegal, ofensivo, discriminatório, que incite ódio ou violência, que assedie ou ameace pessoas, com nudez ou conteúdo sexual explícito, enganoso, spam ou propaganda não autorizada, ou que viole direitos autorais e de terceiros. Não é permitido se passar por outra pessoa nem tentar burlar a segurança do app.' },
  { title: '5. Denúncias, bloqueio e moderação', body: 'Não toleramos conteúdo ou comportamento abusivo. Você pode denunciar receitas e usuários, apagar seus próprios comentários e bloquear usuários pelo app. Analisamos as denúncias e removemos o conteúdo que violar estes termos o mais rápido possível. Podemos suspender ou excluir contas que violem estas regras, sem aviso prévio nos casos graves.' },
  { title: '6. Receitas e saúde', body: 'As receitas são enviadas pelos próprios usuários e não são revisadas por profissionais de saúde ou nutrição. Verifique ingredientes, alergias, restrições alimentares e segurança dos alimentos antes de preparar. O uso das receitas é por sua conta e risco.' },
  { title: '7. Anúncios e compras', body: 'O app exibe anúncios. Você pode comprar a opção "Remover anúncios" (pagamento único) pela loja do seu aparelho. Pagamentos e reembolsos são regidos pelas regras da Google Play ou da App Store.' },
  { title: '8. Exclusão da conta', body: 'Você pode excluir sua conta em Configurações → Excluir conta. Suas receitas, comentários, avaliações e dados de perfil são removidos, e o acesso à conta é encerrado.' },
  { title: '9. Propriedade intelectual do app', body: 'A marca Cooka, o design e o código do app pertencem aos seus responsáveis. Você não pode copiar, modificar ou revender o app.' },
  { title: '10. Limitação de responsabilidade', body: 'O Cooka é oferecido "como está". Não garantimos que o serviço será ininterrupto ou livre de erros e não nos responsabilizamos pelo conteúdo publicado por usuários, nos limites permitidos pela lei.' },
  { title: '11. Alterações', body: 'Podemos atualizar estes termos. Mudanças relevantes serão informadas no app, e o uso após a mudança significa que você concorda com a nova versão.' },
  { title: '12. Lei aplicável', body: 'Estes termos seguem as leis do Brasil. Fica eleito o foro do domicílio do consumidor para resolver conflitos.' },
];

const TERMS_EN: LegalSection[] = [
  { title: '1. Acceptance of terms', body: 'By creating an account or using Cooka, you agree to these Terms of Use and the Privacy Policy. If you do not agree, do not use the app.' },
  { title: '2. Account and minimum age', body: "You must be at least 13 years old. Users under 18 need a parent or guardian's consent. You are responsible for your account information and everything that happens in your account. Keep your credentials safe." },
  { title: '3. Your content', body: 'Recipes, photos, videos, comments and ratings you post are yours. By posting, you grant us a free, non-exclusive license to display, store and distribute that content within Cooka so the service works. You confirm you have the rights to what you post. You can delete your content or your account at any time.' },
  { title: '4. Conduct rules', body: "You may not post content that is illegal, offensive, discriminatory, that incites hate or violence, that harasses or threatens people, that contains nudity or sexually explicit material, that is misleading, spam or unauthorized advertising, or that infringes copyright or third-party rights. You may not impersonate others or try to bypass the app's security." },
  { title: '5. Reporting, blocking and moderation', body: 'We do not tolerate abusive content or behavior. You can report recipes and users, delete your own comments and block users in the app. We review reports and remove content that violates these terms as quickly as possible. We may suspend or delete accounts that violate these rules, without prior notice in serious cases.' },
  { title: '6. Recipes and health', body: 'Recipes are submitted by users and are not reviewed by health or nutrition professionals. Check ingredients, allergies, dietary restrictions and food safety before cooking. You use recipes at your own risk.' },
  { title: '7. Ads and purchases', body: "The app shows ads. You can buy the \"Remove ads\" option (one-time payment) through your device's store. Payments and refunds are governed by Google Play or App Store rules." },
  { title: '8. Account deletion', body: 'You can delete your account in Settings → Delete account. Your recipes, comments, ratings and profile data are removed and account access ends.' },
  { title: '9. App intellectual property', body: 'The Cooka brand, design and code belong to its owners. You may not copy, modify or resell the app.' },
  { title: '10. Limitation of liability', body: 'Cooka is provided "as is". We do not guarantee the service will be uninterrupted or error-free and we are not liable for user-posted content, to the extent permitted by law.' },
  { title: '11. Changes', body: 'We may update these terms. Significant changes will be announced in the app, and continued use after a change means you accept the new version.' },
  { title: '12. Governing law', body: "These terms are governed by the laws of Brazil. The courts of the consumer's domicile will resolve disputes." },
];

const PRIVACY_PT: LegalSection[] = [
  { title: '1. Responsável', body: 'O aplicativo Cooka ("app") é operado pelo responsável indicado nas lojas de aplicativos. Para questões sobre privacidade e tratamento de dados, use o contato indicado no final desta página.' },
  { title: '2. Dados coletados', body: 'Coletamos: (a) e-mail, nome ou apelido e foto (se enviada) para sua conta; (b) conteúdo que você publica (receitas, fotos, comentários, avaliações); (c) dados de uso do app (ex.: interações com receitas e perfis); (d) identificadores do dispositivo para exibição de anúncios (AdMob). O uso de câmera e galeria é apenas para enviar as fotos que você escolher.' },
  { title: '3. Finalidade', body: 'Os dados são usados para: criar e gerenciar sua conta; fornecer as funcionalidades do app (feed, busca, receitas, perfil, comentários, avaliações); moderação e segurança; suporte ao usuário; exibição de anúncios e, se você optar, compra in-app para remover anúncios.' },
  { title: '4. Base legal', body: 'O tratamento se baseia em consentimento (onde aplicável), execução do contrato de uso do app e legítimo interesse (melhoria do serviço e segurança), em conformidade com a LGPD e o GDPR quando aplicável.' },
  { title: '5. Compartilhamento', body: 'Utilizamos: Firebase/Google (autenticação, banco de dados e armazenamento), Google (login e AdMob) e Apple/Google (compra in-app). Não vendemos seus dados pessoais. Os parceiros processam dados conforme suas políticas e contratos de processamento.' },
  { title: '6. Retenção e exclusão', body: 'Mantemos os dados enquanto sua conta existir. Ao excluir a conta em Configurações → Excluir conta, removemos suas receitas, comentários, avaliações, seguidores, notificações e dados de perfil, e encerramos seu acesso. Denúncias de moderação podem ser mantidas pelo tempo necessário para segurança.' },
  { title: '7. Seus direitos', body: 'Você tem direito a acesso, correção, exclusão e portabilidade dos dados, quando aplicável. A exclusão pode ser feita no app: Configurações → Excluir conta. Para outras solicitações, use o contato indicado nesta página.' },
  { title: '8. Crianças', body: 'O Cooka não é direcionado a menores de 13 anos e não coletamos intencionalmente dados deles.' },
  { title: '9. Alterações', body: 'Podemos atualizar esta política. A data da última alteração será indicada no topo. Mudanças relevantes podem ser comunicadas no app.' },
];

const PRIVACY_EN: LegalSection[] = [
  { title: '1. Controller', body: 'The Cooka app ("app") is operated by the party indicated in the app stores. For privacy and data handling questions, use the contact at the bottom of this page.' },
  { title: '2. Data we collect', body: 'We collect: (a) email, name or nickname and photo (if provided) for your account; (b) content you post (recipes, photos, comments, ratings); (c) app usage data (e.g., interactions with recipes and profiles); (d) device identifiers for ad serving (AdMob). Camera and gallery access is only used to upload photos you choose.' },
  { title: '3. Purpose', body: 'Data is used to: create and manage your account; provide app features (feed, search, recipes, profile, comments, ratings); moderation and security; user support; ad serving and, if you choose, in-app purchase to remove ads.' },
  { title: '4. Legal basis', body: 'Processing is based on consent (where applicable), performance of the app terms of service, and legitimate interest (service improvement and security), in compliance with LGPD and GDPR when applicable.' },
  { title: '5. Sharing', body: 'We use: Firebase/Google (authentication, database and storage), Google (login and AdMob) and Apple/Google (in-app purchase). We do not sell your personal data. Partners process data according to their policies and data processing agreements.' },
  { title: '6. Retention and deletion', body: 'We keep data while your account exists. When you delete your account in Settings → Delete account, we remove your recipes, comments, ratings, followers, notifications and profile data, and end your access. Moderation reports may be kept as long as needed for safety.' },
  { title: '7. Your rights', body: 'You have the right to access, correct, delete and port your data, when applicable. You can delete your account in the app: Settings → Delete account. For other requests, use the contact on this page.' },
  { title: '8. Children', body: 'Cooka is not directed to children under 13 and we do not knowingly collect their data.' },
  { title: '9. Changes', body: 'We may update this policy. The date of the last change appears at the top. Significant changes may be announced in the app.' },
];

export function getDoc(kind: 'terms' | 'privacy', lang: Lang): LegalDoc {
  const pt = lang === 'pt';
  if (kind === 'terms') {
    return {
      title: pt ? 'Termos de Uso' : 'Terms of Use',
      updated: pt ? 'Última atualização: 13 de novembro de 2026.' : 'Last updated: November 13, 2026.',
      sections: pt ? TERMS_PT : TERMS_EN,
    };
  }
  return {
    title: pt ? 'Política de Privacidade' : 'Privacy Policy',
    updated: pt ? 'Última atualização: 13 de novembro de 2026.' : 'Last updated: November 13, 2026.',
    sections: pt ? PRIVACY_PT : PRIVACY_EN,
  };
}
