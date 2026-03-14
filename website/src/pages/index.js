import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

const tracks = [
  {
    title: 'Start Here',
    description: 'Install toolchains, connect to devnet, and launch your first stablecoin in under 30 minutes.',
    href: '/docs/guide/getting-started',
    cta: 'Read setup guide',
  },
  {
    title: 'Build with SDK and CLI',
    description: 'Use `@sss/sdk` for application integration and `@sss/cli` for operator workflows.',
    href: '/docs/guide/sdk-cli',
    cta: 'Open API reference',
  },
  {
    title: 'Operate in Production',
    description: 'Deploy, monitor, enforce compliance, and run incident-ready operations.',
    href: '/docs/guide/deployment',
    cta: 'Open operations docs',
  },
];

const standards = [
  {
    name: 'SSS-1',
    summary: 'Core issuance with administrative controls for internal or pilot programs.',
  },
  {
    name: 'SSS-2',
    summary: 'Compliance-first profile with blacklist enforcement and transfer hook controls.',
  },
  {
    name: 'SSS-3',
    summary: 'Advanced privacy profile with confidential transfer support and governed access.',
  },
];

const highlights = [
  {
    title: 'Zero to Production',
    text: 'A structured path from environment setup and first mint to live operations and governance.',
  },
  {
    title: 'Regulatory Controls',
    text: 'Policy-driven controls for role management, transfer restrictions, and emergency response workflows.',
  },
  {
    title: 'Developer and Operator UX',
    text: 'Clear SDK and CLI guidance for application integration, automation, and day-2 operations.',
  },
];

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx(styles.heroBanner)}>
      <div className="container">
        <p className={styles.eyebrow}>Official Documentation</p>
        <h1 className={styles.heroTitle}>{siteConfig.title}</h1>
        <p className={styles.heroSubtitle}>
          Comprehensive technical documentation for designing, launching, and operating stablecoins with the Solana Stablecoin Standard.
        </p>
        <div className={styles.heroActions}>
          <Link className="button button--primary button--lg" to="/docs/guide/quickstart">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/guide/instructions-reference">
            Read instructions reference
          </Link>
        </div>
      </div>
    </header>
  );
}

function HighlightCard({title, text}) {
  return (
    <article className={clsx('col col--4', styles.highlightCard)}>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function TrackCard({title, description, href, cta}) {
  return (
    <article className={clsx('col col--4', styles.trackCard)}>
      <h3>{title}</h3>
      <p>{description}</p>
      <Link to={href}>{cta}</Link>
    </article>
  );
}

function StandardCard({name, summary}) {
  return (
    <article className={clsx('col col--4', styles.standardCard)}>
      <h3>{name}</h3>
      <p>{summary}</p>
      <Link to={`/docs/presets/${name.toLowerCase()}`}>View standard</Link>
    </article>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} Documentation`}
      description="Official Solana Stablecoin Standard documentation from onboarding to advanced production operations."
    >
      <HomepageHeader />
      <main>
        <section className={styles.sectionCompact}>
          <div className="container">
            <div className="row">
              {highlights.map((item) => (
                <HighlightCard key={item.title} {...item} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <h2>Documentation Tracks</h2>
            <div className="row">
              {tracks.map((track) => (
                <TrackCard key={track.title} {...track} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionMuted}>
          <div className="container">
            <h2>Standards</h2>
            <div className="row">
              {standards.map((standard) => (
                <StandardCard key={standard.name} {...standard} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
