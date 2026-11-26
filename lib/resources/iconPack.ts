/**
 * The card icon pack for deal room cards. Each icon has one drawing (24×24 line paths) used two ways: standard cards draw
 * it as a 2px line icon on a tinted tile; Novelty Mode draws it bigger in the illustrated style (dark outline, white
 * body, one colour accent), from `nv`: b = subpaths filled white, a = subpaths stroked in the accent, f = subpaths
 * filled with a tint (index + colour letter), c = the accent colour (p purple, r red, g green, b blue, y yellow, o orange).
 */
export interface PackIcon {
  id: string;
  name: string;
  group: string;
  d: string;
  nv: string;
}
export const PACK: PackIcon[] = [
  { id: 'document', name: 'Document', group: 'Documents', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4', nv: 'b0 a2 cp' },
  { id: 'pdf', name: 'PDF', group: 'Documents', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8.5 17v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M13 13v4M13 13h2M13 15h1.5', nv: 'b0 a2,3,4,5 cr' },
  { id: 'slides', name: 'Slides', group: 'Documents', d: 'M3 4h18M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M12 16v4M8 20h8M9 11l2-2 2 2 3-3', nv: 'b1 a4 cp' },
  { id: 'spreadsheet', name: 'Spreadsheet', group: 'Documents', d: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M4 15h16M10 3v18', nv: 'b0 a1 cg' },
  { id: 'contract', name: 'Contract', group: 'Documents', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-.5M8 11h5', nv: 'b0 a2 cr' },
  { id: 'checklist', name: 'Checklist', group: 'Documents', d: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', nv: 'a3,4,5 cg' },
  { id: 'clipboard', name: 'Clipboard', group: 'Documents', d: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 13l2 2 4-4', nv: 'b1,0 a2 cg' },
  { id: 'one-pager', name: 'One pager', group: 'Documents', d: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 12l2 2 4-4', nv: 'b0 a1 cp' },
  { id: 'book', name: 'Book', group: 'Documents', d: 'M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 1h13v-3M9 7h6', nv: 'b0 a2 cp' },
  { id: 'folder', name: 'Folder', group: 'Documents', d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', nv: 'f0y' },
  { id: 'play', name: 'Play', group: 'Media', d: 'M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.6A1 1 0 0 0 8 5.5z', nv: 'f0k' },
  { id: 'recording', name: 'Recording', group: 'Media', d: 'M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10l5-3v10l-5-3', nv: 'b0 f1b' },
  { id: 'webinar', name: 'Webinar', group: 'Media', d: 'M3 5h18v11H3zM8 20h8M12 16v4M10 8.5v4l3.5-2z', nv: 'b0 f3r' },
  { id: 'microphone', name: 'Microphone', group: 'Media', d: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3', nv: 'b0 a1 cp' },
  { id: 'image', name: 'Image', group: 'Media', d: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16l5-5 4 4 2-2 5 5M15.5 8.5h.01', nv: 'b0 a1 cg f2y' },
  { id: 'gallery', name: 'Gallery', group: 'Media', d: 'M7 7h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM4 16V5a1 1 0 0 1 1-1h11M6 17l4-4 3 3 2-2 5 5', nv: 'b1,0 a2 cg' },
  { id: 'link', name: 'Link', group: 'Links & contact', d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', nv: 'a0 cb' },
  { id: 'open-link', name: 'Open link', group: 'Links & contact', d: 'M7 17L17 7M9 7h8v8', nv: 'a0,1 cb' },
  { id: 'website', name: 'Website', group: 'Links & contact', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z', nv: 'b0 a1 cb' },
  { id: 'calendar', name: 'Calendar', group: 'Links & contact', d: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4M8 14h2M14 14h2M8 17h2', nv: 'b0 a2,3 cr' },
  { id: 'email', name: 'Email', group: 'Links & contact', d: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l9 6 9-6', nv: 'b0 a1 cr' },
  { id: 'chat', name: 'Chat', group: 'Links & contact', d: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', nv: 'f0b' },
  { id: 'pricing', name: 'Pricing', group: 'Business', d: 'M12 3v18M16.5 7.5c-.5-1.5-2.3-2.5-4.5-2.5-2.5 0-4.5 1.3-4.5 3.3 0 4.7 9 2.4 9 7 0 2-2 3.2-4.5 3.2-2.3 0-4.1-1-4.6-2.6', nv: 'a0,1 cg' },
  { id: 'chart', name: 'Chart', group: 'Business', d: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6', nv: 'a4 cp' },
  { id: 'roi', name: 'ROI', group: 'Business', d: 'M3 17l6-6 4 4 8-8M15 7h6v6', nv: 'a0,1 cg' },
  { id: 'calculator', name: 'Calculator', group: 'Business', d: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01', nv: 'b0 f1g' },
  { id: 'pie-chart', name: 'Pie chart', group: 'Business', d: 'M12 3v9h9a9 9 0 1 1-9-9zM15 3.5A9 9 0 0 1 20.5 9H15z', nv: 'b0 f1p' },
  { id: 'handshake', name: 'Handshake', group: 'Business', d: 'M3 12l3-3 4 1 3-2 3 1 5 3M3 12l5 5 1.5-1.5M8 17l2 1.5 1.5-1.5 2 1.5 1.5-1.5 1.5 1 3-3.5M11 10l3 3', nv: 'a0 co' },
  { id: 'target', name: 'Target', group: 'Business', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', nv: 'b0 a1 cr f2r' },
  { id: 'briefcase', name: 'Briefcase', group: 'Business', d: 'M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16', nv: 'b0 a2 co' },
  { id: 'award', name: 'Award', group: 'Business', d: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM8.5 14L7 21l5-2.5 5 2.5-1.5-7', nv: 'f0y' },
  { id: 'case-study', name: 'Case study', group: 'Business', d: 'M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.3l6-.8z', nv: 'f0y' },
  { id: 'timeline', name: 'Timeline', group: 'Business', d: 'M4 6h4M4 12h9M4 18h14M8 4v4M13 10v4M18 16v4', nv: 'a3,4,5 cp' },
  { id: 'rocket', name: 'Rocket', group: 'Business', d: 'M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-4-4zM9 11l-4 1-2 3 4 1M13 15l-1 4-3 2-1-4M15.5 8.5h.01', nv: 'b0 a1,2 cr' },
  { id: 'community', name: 'Community', group: 'Community', d: 'M3 21V9l9-6 9 6v12M9 21v-6h6v6M3 21h18', nv: 'b0 a1 cb' },
  { id: 'building', name: 'Building', group: 'Community', d: 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2', nv: 'b0 a2,3,4,5,6,7 cb' },
  { id: 'campus', name: 'Campus', group: 'Community', d: 'M2 21h20M4 21V11l4-3 4 3v10M12 21V7l4-4 4 4v14M7 14h2M15 10h2M15 14h2', nv: 'b1,2 a3,4,5 cb' },
  { id: 'floor-plan', name: 'Floor plan', group: 'Community', d: 'M4 4h16v16H4zM4 12h7M11 4v10M15 12h5M15 12v8', nv: 'b0 a1,2 cg' },
  { id: 'room', name: 'Room', group: 'Community', d: 'M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 21v-3M21 21v-3M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3', nv: 'b0 f4b' },
  { id: 'map-pin', name: 'Map pin', group: 'Community', d: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', nv: 'b0 f1r' },
  { id: 'night', name: 'Night', group: 'Community', d: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z', nv: 'f0y' },
  { id: 'heart', name: 'Heart', group: 'Care', d: 'M12 20s-8-4.5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20z', nv: 'f0r' },
  { id: 'heartbeat', name: 'Heartbeat', group: 'Care', d: 'M3 12h4l2-5 4 10 2-5h6', nv: 'a0 cr' },
  { id: 'stethoscope', name: 'Stethoscope', group: 'Care', d: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2M20 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', nv: 'a0 cb f2b' },
  { id: 'fall-alert', name: 'Fall alert', group: 'Care', d: 'M12 3l9 16H3zM12 10v4M12 17h.01', nv: 'f0y' },
  { id: 'safety', name: 'Safety', group: 'Care', d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4', nv: 'b0 a1 cg' },
  { id: 'call-bell', name: 'Call bell', group: 'Care', d: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4', nv: 'f0y' },
  { id: 'medication', name: 'Medication', group: 'Care', d: 'M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 7l7 7', nv: 'b0 a1 cr' },
  { id: 'wellness', name: 'Wellness', group: 'Care', d: 'M12 21c-4.5-3-8-6.5-8-11a8 8 0 0 1 8-7 8 8 0 0 1 8 7c0 4.5-3.5 8-8 11zM12 8v6M9 11h6', nv: 'b0 a1,2 cg' },
  { id: 'sensor', name: 'Sensor', group: 'Technology', d: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8', nv: 'f0k a1,2,3,4 cb' },
  { id: 'ai', name: 'AI', group: 'Technology', d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z', nv: 'f0p,1y' },
  { id: 'dashboard', name: 'Dashboard', group: 'Technology', d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M9 21V9', nv: 'b0 a1 cp' },
  { id: 'mobile-app', name: 'Mobile app', group: 'Technology', d: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2', nv: 'b0 a1 cb' },
  { id: 'integration', name: 'Integration', group: 'Technology', d: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5', nv: 'b2 a0,1 cg' },
  { id: 'wi-fi', name: 'Wi-Fi', group: 'Technology', d: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 19.5h.01', nv: 'a0,1,2 cb' },
  { id: 'security', name: 'Security', group: 'Technology', d: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4M12 15v2', nv: 'b0 a2 cr' },
  { id: 'settings', name: 'Settings', group: 'Technology', d: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', nv: 'b1 a0 cp' },
  { id: 'team', name: 'Team', group: 'People & help', d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 4 6', nv: 'b0,1 a2,3 cp' },
  { id: 'resident', name: 'Resident', group: 'People & help', d: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', nv: 'b0,1 f0p' },
  { id: 'family', name: 'Family', group: 'People & help', d: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 21v-5a5 5 0 0 1 10 0M11 21v-4a5 5 0 0 1 10 0v4M12 14a2 2 0 1 0 0-4', nv: 'b0,1 a4 co' },
  { id: 'caregiver', name: 'Caregiver', group: 'People & help', d: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21v-6a6 6 0 0 1 12 0v6M12 13.5s-2.5-1.3-2.5-3a1.3 1.3 0 0 1 2.5-.6 1.3 1.3 0 0 1 2.5.6c0 1.7-2.5 3-2.5 3z', nv: 'b0,1 f2r' },
  { id: 'training', name: 'Training', group: 'People & help', d: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6', nv: 'b0 a2 cy' },
  { id: 'support', name: 'Support', group: 'People & help', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01', nv: 'b0 a1,2 cb' },
  { id: 'quote', name: 'Quote', group: 'People & help', d: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6', nv: 'a0,1 cp' },
  { id: 'idea', name: 'Idea', group: 'People & help', d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z', nv: 'f2y' },
  { id: 'welcome', name: 'Welcome', group: 'People & help', d: 'M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 7 7 0 0 1-5.5-2.7L3.6 14.6a1.5 1.5 0 0 1 2.3-1.9L7 14', nv: 'b0,1,2,3,4' },
];
export const PACK_GROUPS = [...new Set(PACK.map((i) => i.group))];
export const PACK_IDS = new Set(PACK.map((i) => i.id));
export const packIcon = (id: string) => PACK.find((i) => i.id === id) ?? null;

/** Standard cards' tile tints: [background, icon colour]. */
export const TINTS: Record<string, { name: string; bg: string; fg: string }> = {
  sand: { name: 'Sand', bg: '#FFF4D6', fg: '#8A5A00' },
  lilac: { name: 'Lilac', bg: '#E7E2FB', fg: '#5B4BC4' },
  sky: { name: 'Sky', bg: '#EEF5FE', fg: '#1F5FB5' },
  mint: { name: 'Mint', bg: '#EEF8F1', fg: '#1E7A4C' },
  coral: { name: 'Coral', bg: '#FDF0EE', fg: '#C2412D' },
  stone: { name: 'Stone', bg: '#F1EEE7', fg: '#3F4753' },
  teal: { name: 'Teal', bg: '#E6F6F6', fg: '#0F7C80' },
  ink: { name: 'Ink', bg: '#1C2430', fg: '#FFFFFF' },
};
export const TINT_IDS = new Set(Object.keys(TINTS));
/** A tint that suits each group (what a freshly picked icon starts with). */
export const GROUP_TINT: Record<string, string> = { Documents: 'lilac', Media: 'ink', 'Links & contact': 'sand', Business: 'mint', Community: 'sky', Care: 'coral', Technology: 'teal', 'People & help': 'stone' };
