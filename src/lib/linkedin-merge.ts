import type { Profile, Row } from "@/lib/types"

/** What the import returns: the profile's own shapes, so it drops straight in. */
export interface LinkedInProfile {
  name: string
  headline: string
  place: string
  about: string
  /** The profile picture as a data URL, when LinkedIn gave one. */
  photo?: string
  /** The rest of what the profile says (certifications, projects, volunteering, honors), for reading skills out of. */
  cv: string
  positions: Row[]
  education: Row[]
  skills: Row[]
  languages: Row[]
}

/** The imported profile laid over yours: lists are replaced, the text fields only fill what is empty. */
export function mergeLinkedIn(profile: Profile, li: LinkedInProfile): Profile {
  return {
    ...profile,
    name: profile.name || li.name,
    headline: profile.headline || li.headline,
    place: profile.place || li.place,
    about: profile.about || li.about,
    cv: profile.cv || li.cv || "",
    positions: li.positions.length ? li.positions : profile.positions,
    education: li.education.length ? li.education : profile.education,
    skills: li.skills.length ? li.skills : profile.skills,
    languages: li.languages.length ? li.languages : profile.languages,
  }
}
