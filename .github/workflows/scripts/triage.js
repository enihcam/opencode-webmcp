const issue = context.payload.issue;
const owner = context.repo.owner;
const repo = context.repo.repo;

// Check if already has a triage comment
const comments = await github.rest.issues.listComments({
  owner, repo,
  issue_number: issue.number
});

const alreadyTriaged = comments.data.some(
  c => c.user.login === 'github-actions[bot]' &&
       c.body.includes('## Triage')
);

if (!alreadyTriaged) {
  const body = [
    '## Triage',
    '',
    'Thanks for opening this issue! I\'ve added the `needs-triage` label. An agent will review it shortly.',
    '',
    '**Labels applied:**',
    '- `needs-triage` — awaiting review',
    '',
    '**Next steps:**',
    '- `needs-info` — we\'ll ask for more details',
    '- `ready-for-agent` — well-specified, AI can implement',
    '- `ready-for-human` — needs human judgement',
    '- `wontfix` — out of scope',
  ].join('\n');

  await github.rest.issues.createComment({
    owner, repo,
    issue_number: issue.number,
    body,
  });
}
