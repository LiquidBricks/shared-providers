/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'getting-started',
        'nats-context',
        'diagnostics',
        'subject-router',
      ],
    },
    'api-exports',
  ],
};

module.exports = sidebars;
