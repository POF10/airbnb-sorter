// Airbnb's registrable domains, from the language and region picker on its home page (2026-10-01).
// A manifest cannot match by regex like the userscript's @include, so each domain is listed.
const SINGLE = 'ae am at az ba be ca cat ch cl cz de dk es fi fr gr gy hu ie is it jp lt lu lv me mx nl no pl pt rs ru se si';
const COM = 'ar au bo br bz co ec ee gt hk hn mt my ni pa pe ph py ro sg sv tr tw ua vn';
const CO = 'cr id in kr nz uk ve za';

const zones = (list, prefix = '') => list.split(' ').map(zone => `airbnb.${prefix}${zone}`);

export const DOMAINS = ['airbnb.com', ...zones(SINGLE), ...zones(COM, 'com.'), ...zones(CO, 'co.')];
