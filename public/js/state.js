// state.js: single shared mutable state object imported by all app modules
export const state = {
  currentUser: null,
  token: null,
  partnerId: null,
  partnerProfile: {},
  localStream: null,
  pc: null,
  isMuted: false,
  isCamOff: false,
  locationCoords: null,
  locBannerCallback: null,
  currentScreen: 'home',
};
