// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Shared Providers',
  tagline: 'Diagnostics and NATS context utilities',
  url: 'https://example.com',
  baseUrl: '/',
  favicon: 'img/logo.svg',
  organizationName: 'liquid-bricks',
  projectName: 'shared-providers',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */ (
        {
          docs: {
            sidebarPath: require.resolve('./sidebars.js'),
            routeBasePath: '/',
            editUrl: undefined,
          },
          blog: false,
          theme: {
            customCss: require.resolve('./src/css/custom.css'),
          },
        }
      ),
    ],
  ],

  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    image: 'img/social-card.png',
    navbar: {
      title: 'Shared Providers',
      logo: { alt: 'Shared Providers Logo', src: 'img/logo.svg' },
      items: [
        { to: '/', label: 'Docs', position: 'left' },
        {
          href: 'https://github.com/liquid-bricks/shared-providers',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/liquid-bricks/shared-providers' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Liquid Bricks.`,
    },
  }),
};

module.exports = config;
