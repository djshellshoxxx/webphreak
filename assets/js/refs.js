/*
 * WebPhreak source register. Each catalog entry cites ids from this table.
 * `seen` records how the source was consulted during research for this build:
 *   'search-summary' : only search-engine summaries were available (page fetching was
 *                      blocked by the build environment's network policy)
 *   'not-opened'     : primary document identified but not read
 * `kind`: 'primary' (standard, manufacturer, regulator, original paper),
 *         'secondary' (encyclopedia, vendor implementation notes, patents quoting specs),
 *         'hobbyist' (historical phreak or enthusiast texts).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).refs = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = (title, publisher, url, kind, seen, section) => ({ title, publisher, url, kind, seen: seen || 'search-summary', section: section || '' });
  return {
    'itu-q23': R('Recommendation Q.23: Technical features of push-button telephone sets', 'ITU-T', 'https://www.itu.int/rec/T-REC-Q.23/en', 'primary', 'not-opened'),
    'wiki-dtmf': R('Dual-tone multi-frequency signaling', 'Wikipedia', 'https://en.wikipedia.org/wiki/Dual-tone_multi-frequency_signaling', 'secondary'),
    'atis-autovon': R('ATIS Telecom Glossary: AUTOVON precedence keys', 'ATIS', 'https://glossary.atis.org/?p=8500', 'secondary'),
    'wiki-autovon': R('Autovon', 'Wikipedia', 'https://en.wikipedia.org/wiki/Autovon', 'secondary'),
    'wiki-mf': R('Multi-frequency signaling', 'Wikipedia', 'https://en.wikipedia.org/wiki/Multi-frequency_signaling', 'secondary'),
    'iana-tel-events': R('Audio/telephone-event registry (RFC 4733/4734 event codes incl. MF KP, ST, STP, ST2P, ST3P)', 'IANA', 'https://www.iana.org/assignments/audio-telephone-event-registry', 'primary', 'search-summary'),
    'ietf-avt-mf': R('IETF AVT working group thread on MF signal naming', 'IETF mail archive', 'https://mailarchive.ietf.org/arch/msg/avt/wjmm0lvhU-468FPfsKzaYhXHmDE/', 'secondary'),
    'dialogic-mf': R('Natural Access ADI API manual: adiStartMFDetector', 'Dialogic', 'https://www.dialogic.com/webhelp/NaturalAccess/Release9.0/Alliance_Device_Interface_API_Dev_Manual/adistartmfdetector.html', 'secondary'),
    'bstj-1960': R('C. Breen & C. A. Dahlbom, "Signaling Systems for Control of Telephone Switching", Bell System Technical Journal 39(6), Nov. 1960, pp. 1381-1444', 'AT&T / World Radio History archive', 'https://www.worldradiohistory.com/Archive-Bell-System-Technical-Journal/60s/Bell-System-Technical-Journal-1960-6-Complete.pdf', 'primary', 'not-opened'),
    'bstj-1954': R('"In-Band Single-Frequency Signaling", Bell System Technical Journal 33, 1954, pp. 1309-1330 (authorship not confirmed in this research pass)', 'Nokia Bell Labs', 'https://www.nokia.com/bell-labs/publications-and-media/publications/in-band-single-frequency-signaling/', 'primary', 'not-opened'),
    'wiki-sf': R('Single-frequency signaling', 'Wikipedia', 'https://en.wikipedia.org/wiki/Single-frequency_signaling', 'secondary'),
    'wiki-2600': R('2600 hertz', 'Wikipedia', 'https://en.wikipedia.org/wiki/2600_hertz', 'secondary'),
    'wiki-ss7': R('Signalling System No. 7', 'Wikipedia', 'https://en.wikipedia.org/wiki/Signalling_System_No._7', 'secondary', 'not-opened'),
    'dialogic-ss5': R('Natural Access CAS API manual: SS5 signaling', 'Dialogic', 'https://www.dialogic.com/webhelp/NaturalAccess/Release9.0/CAS_API_Dev_Manual/ss5_signaling.htm', 'secondary'),
    'itu-q140': R('Recommendations Q.140-Q.180: Signalling System No. 5', 'ITU-T', 'https://www.itu.int/rec/T-REC-Q.140-Q.180/en', 'primary', 'not-opened'),
    'itu-q120': R('Recommendations Q.120-Q.139: Signalling System No. 4', 'ITU-T', 'https://www.itu.int/rec/T-REC-Q.120-Q.139/en', 'primary', 'not-opened'),
    'phrack-3-4': R('Phrack issue 3, article 4 (CCITT No. 4 description)', 'Phrack', 'https://phrack.org/issues/3/4', 'hobbyist'),
    'phrack-11-8': R('Phrack issue 11, article 8 (2600 Hz trunk seizure description)', 'Phrack (mirror)', 'https://git.0l.de/Mirrors/Zines/src/branch/master/phrack/11/8.txt', 'hobbyist'),
    'us5168518': R('US Patent 5,168,518 (quotes Bellcore ACTS coin-signal timing)', 'Google Patents', 'https://patents.google.com/patent/US5168518', 'secondary'),
    'wiki-redbox': R('Red box (phreaking)', 'Wikipedia', 'https://en.wikipedia.org/wiki/Red_box_(phreaking)', 'secondary'),
    'phrack-33-9': R('Phrack issue 33, article 9 (red box timing)', 'Phrack', 'https://phrack.org/issues/33/9', 'hobbyist'),
    'wiki-greenbox': R('Green box (phreaking)', 'Wikipedia', 'https://en.wikipedia.org/wiki/Green_box_(phreaking)', 'secondary'),
    'tf-greenbox': R('textfiles.com: green box text file', 'textfiles.com mirror', 'https://mirror.cyberbits.eu/textfiles.com/phreak/BOXES/green', 'hobbyist'),
    'wiki-nortel-pay': R('Nortel payphones (Millennium)', 'Wikipedia', 'https://en.wikipedia.org/wiki/Nortel_payphones', 'secondary'),
    'tw-nortel': R('Northern Electric / Northern Telecom / Nortel pay phones', 'TelephoneWorld', 'https://telephoneworld.org/pay-telephones/fortress-style-pay-phones-the-more-modern-pay-phone/northern-electric-northern-telecom-nortel-pay-phones/', 'hobbyist'),
    'fcc-18-21': R('FCC 18-21 Report and Order (payphone compensation audit rules)', 'U.S. Federal Communications Commission, 2018', 'https://docs.fcc.gov/public/attachments/FCC-18-21A1_Rcd.pdf', 'primary', 'not-opened'),
    'axios-payphones': R('"FCC no longer cares to regulate pay phones because there are so few left", Dec. 15, 2017', 'Axios', 'https://www.axios.com/2017/12/15/fcc-no-longer-cares-to-regulate-pay-phones-because-there-are-so-few-left-1513303183', 'secondary'),
    'wiki-ptp': R('Precise tone plan', 'Wikipedia', 'https://en.wikipedia.org/wiki/Precise_tone_plan', 'secondary'),
    'wiki-cpt': R('Call-progress tone', 'Wikipedia', 'https://en.wikipedia.org/wiki/Call-progress_tone', 'secondary'),
    'zytrax-tones': R('Telephony: network tones (cites ANSI T1.401)', 'ZYTRAX', 'https://www.zytrax.com/tech/telephony/net_tones.htm', 'secondary'),
    'wiki-sit': R('Special information tone', 'Wikipedia', 'https://en.wikipedia.org/wiki/Special_information_tone', 'secondary'),
    'audiocodes-sit': R('Mediant 500 SBC user manual: SIT event detection', 'AudioCodes', 'https://techdocs.audiocodes.com/session-border-controller-sbc/mediant-500-sbc/user-manual/version-740/Content/UM/SIT%20Event%20Detection.htm', 'secondary'),
    'w4zt-sit': R('SIT tone frequencies', 'W4ZT', 'https://w4zt.wa4dsy.com/freqs/sit.html', 'hobbyist'),
    'itu-e180': R('Recommendation E.180: Technical characteristics of tones for the telephone service', 'ITU-T', 'https://www.itu.int/rec/T-REC-E.180/en', 'primary', 'not-opened'),
    'us5862212': R('US Patent 5,862,212 (CPE alerting signal 2130 + 2750 Hz)', 'Google Patents', 'https://patents.google.com/patent/US5862212', 'secondary'),
    'wiki-roh': R('Off-hook tone', 'Wikipedia', 'https://en.wikipedia.org/wiki/Off-hook_tone', 'secondary'),
    'atis-rw': R('ATIS Telecom Glossary: recorder warning tone', 'ATIS', 'https://glossary.atis.org/?p=17114', 'secondary'),
    'cept-tones': R('CEPT Recommendation T/CS 20-15 (tones)', 'ETSI / CEPT', 'https://etsi.org/deliver/cept/20/2015CS.PDF', 'primary', 'search-summary'),
    '3gpp-22001': R('3GPP TS 22.001 annex F.2.5 (supervisory tones)', '3GPP', 'https://itecspec.com/3gpp/22.001/s/f.2.5', 'secondary'),
    'wiki-dialtone': R('Dial tone', 'Wikipedia', 'https://en.wikipedia.org/wiki/Dial_tone', 'secondary'),
    'asterisk-uk': R('ASTERISK-03355: UK tone definitions taken from BT SIN 350', 'Asterisk issue archive', 'https://issues-archive.asterisk.org/ASTERISK-03355', 'secondary'),
    'bt-ac': R('Line signalling systems overview (AC1, AC9, AC13, SSAC15)', 'britishtelephones.com', 'https://www.britishtelephones.com/pwover1.htm', 'hobbyist'),
    'wiki-r2': R('Signalling System R2', 'Wikipedia', 'https://en.wikipedia.org/wiki/Signalling_System_R2', 'secondary'),
    'itu-q441': R('Recommendation Q.441: Signalling code (R2 inter-register)', 'ITU-T', 'https://www.itu.int/rec/T-REC-Q.441/en', 'primary', 'not-opened'),
    'wiki-ctcss': R('Continuous Tone-Coded Squelch System', 'Wikipedia', 'https://en.wikipedia.org/wiki/Continuous_Tone-Coded_Squelch_System', 'secondary'),
    'rb-ctcss': R('CTCSS tone chart', 'Repeater Builder', 'https://repeater-builder.com/tech-info/ctcss/ctcss-chart.html', 'hobbyist'),
    'ukrep-1750': R('Repeater access (1750 Hz tone burst)', 'UK Repeater', 'https://www.ukrepeater.net/access.htm', 'secondary'),
    'wiki-ccir-selcall': R('CCIR (selcall)', 'Wikipedia', 'https://en.wikipedia.org/wiki/CCIR_(selcall)', 'secondary'),
    'sigid-zvei': R('ZVEI Selcall', 'Signal Identification Wiki', 'https://www.sigidwiki.com/wiki/ZVEI_Selcall', 'hobbyist', 'not-opened'),
    'midian-charts': R('Tone signaling charts', 'Midian Electronics (via sigidwiki)', 'https://www.sigidwiki.com/images/f/f3/Tone-signaling-charts.pdf', 'secondary'),
    'wiki-selcal': R('SELCAL', 'Wikipedia', 'https://en.wikipedia.org/wiki/SELCAL', 'secondary'),
    'asri-selcal': R('SELCAL Users Guide Rev D (2019)', 'Aviation Spectrum Resources Inc.', 'https://asri.aero/wp-content/uploads/2021/11/20190407-ASRI-SELCAL-Users-Guide-Rev-D.pdf', 'primary', 'search-summary'),
    'batlabs-qc2': R('Motorola Quick Call II', 'BatLabs', 'https://batlabs.com/qcii.html', 'hobbyist', 'search-summary'),
    'plectron-tones': R('Plectron tone list', 'policeinterceptor.com', 'https://mail.policeinterceptor.com/plectron.htm', 'hobbyist'),
    'tait-mdc': R('Tait TN-1103: Definition of MDC-1200 signalling in the TM8100', 'Tait (via repeater-builder)', 'https://manuals.repeater-builder.com/2007/TECHNOTE/TM8000/TN-1103_Definition%20of%20MDC-1200%20Signalling%20in%20the%20TM8100.pdf', 'primary', 'search-summary'),
    'sigid-modat': R('MODAT', 'Signal Identification Wiki', 'https://sigidwiki.com/wiki/MODAT', 'hobbyist'),
    'byte-kcs': R('"BYTE\'s Audio Cassette Standards Symposium", BYTE, Feb. 1976', 'BYTE (via deramp.com)', 'https://deramp.com/swtpc.com/BYTE/Feb1976/Byte_Symposium.htm', 'primary', 'not-opened'),
    'wiki-kcs': R('Kansas City standard', 'Wikipedia', 'https://en.wikipedia.org/wiki/Kansas_City_standard', 'secondary'),
    's100-cuts': R('Processor Technology CUTS board', 'S100Computers', 'https://s100computers.com/Hardware%20Folder/Processor%20Technology/CUTS/CUTS.htm', 'hobbyist'),
    'tarbell-manual': R('Tarbell Cassette Interface Technical Manual', 'Tarbell Electronics (scan via hackaday.io)', 'https://cdn.hackaday.io/files/1737557433933920/Tarbell%20Cassette%20Interface%20Technical%20Manual.pdf', 'primary', 'not-opened'),
    'cfr-11-31': R('47 CFR 11.31: EAS protocol', 'U.S. Code of Federal Regulations (LII)', 'https://www.law.cornell.edu/cfr/text/47/11.31', 'primary', 'search-summary'),
    'itu-m493': R('Recommendation ITU-R M.493-12: Digital selective-calling system for use in the maritime mobile service', 'ITU-R, 2007', 'https://www.itu.int/dms_pubrec/itu-r/rec/m/R-REC-M.493-12-200703-S!!PDF-A.pdf', 'primary', 'search-summary'),
    'ccitt-o6': R('CCITT Recommendation O.6 (1992 text): 1020 Hz reference test frequency', 'CCITT (mirror at MIT)', 'https://stuff.mit.edu/afs/net/dev/reference/ccitt/1992/o/o6.asc', 'primary', 'search-summary'),
    'prc68-kyv2': R('KY-57 / VINSON notes', 'PRC68.com', 'https://www.PRC68.com/I/KYV2.shtml', 'hobbyist'),
    'wiki-pulse': R('Pulse dialing', 'Wikipedia', 'https://en.wikipedia.org/wiki/Pulse_dialing', 'secondary'),
    'cept-4902': R('CEPT Recommendation T/CS 49-02 (dial pulse limits)', 'ETSI / CEPT', 'https://etsi.org/deliver/cept/49/4902CS.PDF', 'primary', 'search-summary'),
    'bt-howdial': R('How a telephone dial works', 'britishtelephones.com', 'https://www.britishtelephones.com/howdial.htm', 'hobbyist')
  };
});
