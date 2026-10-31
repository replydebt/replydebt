// Loading screen: skeletons + live progress bar (shown only when parsing takes >120ms).
import { h } from '../ui/h.js';
import { logo } from '../ui/icons.js';

export function renderLoading() {
  const bar = h('div.progress__bar');
  const step = h('p.t-14.t-low', 'Opening your archive');
  const skelRow = () => h(
    'div.skel-row',
    h('div.skel.skel--circle.skel--avatar'),
    h(
      'div.skel-row__lines',
      h('div.skel.skel--line-sm'),
      h('div.skel.skel--line-md'),
      h('div.skel.skel--line-lg'),
    ),
  );
  const el = h(
    'div',
    h('header.gnav', h('div.gnav__inner', logo(34), h('div.skel.skel--nav'))),
    h(
      'div.layout',
      h('aside.rail.rail--left', h('section.card.skel-card--left', h('div.skel.skel--cover'))),
      h(
        'main.main',
        { id: 'main', 'aria-busy': 'true' },
        h(
          'section.card.loading-card',
          h('div.loading-card__top', logo(24), h('h1.loading-card__title', 'Reading your LinkedIn archive locally')),
          h('div.progress', { role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '4' }, bar),
          step,
          h('p.t-12.t-low', 'Parsed inside your browser tab. Zero bytes are uploaded.'),
        ),
        h('section.card', skelRow(), skelRow(), skelRow()),
      ),
      h('aside.rail.rail--right', h('section.card.skel-card--right')),
    ),
  );
  return {
    el,
    progress(text, pct) {
      step.textContent = text;
      bar.style.width = `${Math.max(4, Math.min(100, pct))}%`;
      bar.parentElement.setAttribute('aria-valuenow', String(Math.round(pct)));
    },
  };
}
