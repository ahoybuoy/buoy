// packages/scanners/src/__tests__/fixtures/astro-components.ts

/**
 * Simple Astro component with no props
 */
export const SIMPLE_BUTTON_ASTRO = `---
---
<button class="btn">Click me</button>

<style>
  .btn {
    padding: 0.5rem 1rem;
    background: blue;
    color: white;
  }
</style>
`;

/**
 * Astro component with TypeScript props interface
 */
export const CARD_WITH_PROPS_ASTRO = `---
interface Props {
  title: string;
  description?: string;
  variant?: 'default' | 'featured';
}

const { title, description = 'No description', variant = 'default' } = Astro.props;
---
<article class:list={['card', variant]}>
  <h2>{title}</h2>
  {description && <p>{description}</p>}
</article>

<style>
  .card {
    padding: 1rem;
    border: 1px solid #ccc;
  }
  .featured {
    border-color: gold;
  }
</style>
`;

/**
 * Astro component with type alias for props
 */
export const COMPONENT_WITH_TYPE_PROPS_ASTRO = `---
type Props = {
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const { size, disabled = false } = Astro.props;
---
<button class={size} disabled={disabled}>
  <slot />
</button>
`;

/**
 * Astro component with inline destructured props
 */
export const INLINE_PROPS_ASTRO = `---
const { href, label, external = false } = Astro.props as { href: string; label: string; external?: boolean };
---
<a href={href} target={external ? '_blank' : undefined}>{label}</a>
`;

/**
 * Deprecated Astro component
 */
export const DEPRECATED_COMPONENT_ASTRO = `---
/**
 * @deprecated Use NewHeader instead
 */
interface Props {
  title: string;
}

const { title } = Astro.props;
---
<header>
  <h1>{title}</h1>
</header>
`;

/**
 * Astro component with imported dependencies
 */
export const COMPONENT_WITH_DEPENDENCIES_ASTRO = `---
import Header from './Header.astro';
import Footer from './Footer.astro';
import { formatDate } from '../utils/date';

interface Props {
  title: string;
}

const { title } = Astro.props;
---
<div class="layout">
  <Header title={title} />
  <main>
    <slot />
  </main>
  <Footer />
</div>
`;

/**
 * Astro layout component
 */
export const LAYOUT_ASTRO = `---
import Navigation from '../components/Navigation.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description?: string;
}

const { title, description } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <Navigation />
    <main>
      <slot />
    </main>
    <Footer />
  </body>
</html>
`;

/**
 * Astro component using Astro.slots
 */
export const COMPONENT_WITH_SLOTS_ASTRO = `---
interface Props {
  variant?: 'primary' | 'secondary';
}

const { variant = 'primary' } = Astro.props;
const hasFooter = Astro.slots.has('footer');
---
<div class:list={['container', variant]}>
  <div class="content">
    <slot />
  </div>
  {hasFooter && (
    <footer>
      <slot name="footer" />
    </footer>
  )}
</div>
`;

/**
 * Astro page component (should be detected too)
 */
export const PAGE_COMPONENT_ASTRO = `---
import Layout from '../layouts/Layout.astro';
import Card from '../components/Card.astro';

const posts = await Astro.glob('../content/blog/*.md');
---
<Layout title="Blog">
  <h1>Blog Posts</h1>
  {posts.map(post => (
    <Card title={post.frontmatter.title} description={post.frontmatter.description} />
  ))}
</Layout>
`;
