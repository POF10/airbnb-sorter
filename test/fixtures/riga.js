// Trimmed real StaySearchResult objects (structure preserved) from
// https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2, captured 2026-09-28.
export const RIGA_URL = 'https://www.airbnb.com/s/Riga--Latvia/homes?checkin=2026-10-16&checkout=2026-10-19&adults=2';

export const regular = {
  __typename: 'StaySearchResult',
  avgRatingLocalized: '5.0 (200)',
  badges: [{ __typename: 'ExploreFormattedBadge', style: 'LOUD_ROUNDED_PILL', text: 'Guest favorite' }],
  contextualPictures: [
    { __typename: 'ExplorePicture', id: '1867977737', picture: 'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTExNTczNDM5NjgxMDg3MjYzMQ%3D%3D/original/0f1.jpeg' },
    { __typename: 'ExplorePicture', id: '1898334606', picture: 'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTExNTczNDM5NjgxMDg3MjYzMQ%3D%3D/original/692.jpeg' },
  ],
  demandStayListing: {
    __typename: 'DemandStayListing',
    id: 'RGVtYW5kU3RheUxpc3Rpbmc6MTExNTczNDM5NjgxMDg3MjYzMQ==',
    location: { __typename: 'DemandStayListingLocation', coordinate: { __typename: 'Coordinate', latitude: 56.9536, longitude: 24.1324 } },
  },
  nameLocalized: { __typename: 'UGCText', localizedStringWithTranslationPreference: 'Charming Apartment with  Terrace and Free Parking' },
  structuredContent: {
    __typename: 'ExploreStructuredContent',
    primaryLine: [
      { __typename: 'MainSectionMessage', body: '1 bedroom', type: 'BEDINFO' },
      { __typename: 'MainSectionMessage', body: '2 beds', type: 'BEDINFO' },
    ],
  },
  structuredDisplayPrice: {
    __typename: 'StructuredDisplayPrice',
    displayPriceStyle: 'REGULATED_TOTAL',
    primaryLine: { __typename: 'QualifiedDisplayPriceLine', accessibilityLabel: '€223 total', price: '€223', qualifier: 'total' },
  },
  subtitle: 'Charming Apartment with  Terrace and Free Parking',
  title: 'Condo in Centrs',
};

export const discounted = {
  ...regular,
  avgRatingLocalized: 'New',
  badges: [],
  demandStayListing: { ...regular.demandStayListing, id: btoa('DemandStayListing:42') },
  structuredDisplayPrice: {
    __typename: 'StructuredDisplayPrice',
    primaryLine: {
      __typename: 'DiscountedDisplayPriceLine',
      accessibilityLabel: '€146 total, originally €175',
      discountedPrice: '€146',
      originalPrice: '€175',
      qualifier: 'total',
    },
  },
  title: 'Apartment in Riga',
};

export const noCoords = {
  ...regular,
  contextualPictures: [],
  demandStayListing: { id: btoa('DemandStayListing:7') },
  nameLocalized: null,
  structuredDisplayPrice: null,
  subtitle: 'Fallback name',
};

export const noId = { ...regular, demandStayListing: null };
