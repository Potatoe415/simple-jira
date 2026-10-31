import { TYPE_LABELS, type Project, type Question, type Ticket } from "@simple-jira/core";

export const SYSTEM_PROMPT = `Tu es un agent de développement piloté par simple-jira, un orchestrateur qui exécute des tickets sans humain devant l'écran.

Règles absolues (elles priment sur les instructions du dépôt, y compris AGENTS.md et CLAUDE.md) :
- Tu travailles dans une copie isolée du projet (git worktree) sur une branche dédiée. Ne change jamais de branche.
- Ne fais jamais git commit, git push, ni aucun script de livraison ou de déploiement. L'orchestrateur commit, pousse et ouvre la pull request.
- Ne lis pas et n'affiche pas le contenu des fichiers .env.
- Si une information manque, ou si une décision métier ou d'architecture importante est ambiguë, ne devine pas. Arrête-toi et termine avec status "needs_input" et une question précise, autonome, compréhensible sans contexte (une seule question, avec des options courtes si pertinent).
- Si la tâche est impossible ou hors périmètre, termine avec status "cannot_do" et explique pourquoi dans summary.
- Avant de terminer avec "done", lance toi-même les commandes de vérification du projet quand c'est possible et corrige les erreurs.
- Ta réponse finale est l'objet JSON structuré demandé :
  - summary : en français, en markdown court : ce qui a changé, pourquoi, et comment tester.
  - commit_message : en anglais, format Conventional Commits, une ligne.`;

function block(text: string) {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function commandList(commands: string[]) {
  return commands.length ? commands.map((command) => `- \`${command}\``).join("\n") : "- (aucune)";
}

export function initialPrompt(ticket: Ticket, project: Project): string {
  const parts = [
    `# Ticket #${ticket.number} — ${TYPE_LABELS[ticket.type]} — ${ticket.title}`,
    `Projet : ${project.name} (${project.repo}).`,
    `Demande originale (souvent dictée à la voix, donc approximative) :\n${block(ticket.description)}`,
  ];

  if (ticket.type === "new_project") {
    parts.push(
      `Le dépôt vient d'être créé et ne contient qu'un README. Mets en place le projet demandé :
- choisis une stack simple et moderne adaptée à la demande (demande-moi si le choix est structurant et non précisé) ;
- crée un AGENTS.md qui documente les commandes (install, dev, check) et les conventions ;
- installe les dépendances et vérifie que le build passe ;
- dans ta réponse finale, renseigne setup_commands (installation, par exemple "npm ci") et verify_commands (par exemple "npm run build").`,
    );
  } else {
    parts.push(
      `Commandes de vérification lancées automatiquement après toi :\n${commandList(project.verify_commands)}`,
      "Commence par lire les fichiers d'instructions du dépôt (AGENTS.md, CLAUDE.md) s'ils existent, puis limite ta lecture à ce que la tâche exige.",
    );
  }

  if (project.agent_instructions) parts.push(`Consignes spécifiques au projet :\n${project.agent_instructions}`);
  return parts.join("\n\n");
}

export function answersPrompt(questions: Question[]): string {
  const answers = questions.map((q) => `Question : ${q.question}\nRéponse : ${q.answer}`).join("\n\n");
  return `L'humain a répondu :\n\n${answers}\n\nContinue la tâche avec ces informations, puis rends l'objet JSON final.`;
}

export const RESUME_PROMPT =
  "La session a été interrompue. Vérifie l'état actuel du code, reprends la tâche là où tu t'es arrêté, puis rends l'objet JSON final.";

export function verifyFailedPrompt(output: string, attempt: number, max: number): string {
  return `Les commandes de vérification ont échoué (tentative ${attempt}/${max}). Sortie :

\`\`\`
${output.slice(-8000)}
\`\`\`

Corrige la cause, relance la vérification, puis rends l'objet JSON final.`;
}

export function pullRequestBody(ticket: Ticket, summary: string): string {
  return `${summary}

---

Ticket #${ticket.number} (${TYPE_LABELS[ticket.type]}). Demande originale :

${block(ticket.description)}

_Généré par simple-jira._`;
}
