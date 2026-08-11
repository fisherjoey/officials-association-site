// Mock data for members and activities when Netlify Functions aren't available

export interface MockMember {
  id: string
  netlify_user_id: string
  name: string
  email: string
  phone?: string
  certification_level?: string
  rank?: number
  status: string
  role: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  custom_fields?: Record<string, any>
  notes?: string
  created_at: string
  updated_at: string
}

export interface MockActivity {
  id: string
  member_id: string
  activity_type: string
  activity_date: string
  activity_data?: Record<string, any>
  notes?: string
  created_at: string
}

// Mock members
export const mockMembers: MockMember[] = [
  {
    id: 'mock-member-1',
    netlify_user_id: 'dev-user-admin',
    name: 'Development Admin User',
    email: 'dev@example.com',
    phone: '(403) 555-0100',
    certification_level: 'Level 3',
    rank: 5,
    status: 'active',
    role: 'admin',
    address: '123 Main Street',
    city: 'Example City',
    province: 'AB',
    postal_code: 'T2P 1J9',
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '(403) 555-0101',
    notes: 'This is a mock development user for testing.',
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-01-15T08:00:00Z'
  },
  {
    id: 'mock-member-2',
    netlify_user_id: 'user-executive-1',
    name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '(403) 555-0200',
    certification_level: 'Level 4',
    rank: 8,
    status: 'active',
    role: 'executive',
    address: '456 Oak Avenue',
    city: 'Example City',
    province: 'AB',
    postal_code: 'T2N 4N1',
    emergency_contact_name: 'Sarah Smith',
    emergency_contact_phone: '(403) 555-0201',
    notes: 'Executive board member, handles scheduling.',
    created_at: '2024-01-10T08:00:00Z',
    updated_at: '2024-01-10T08:00:00Z'
  },
  {
    id: 'mock-member-3',
    netlify_user_id: 'user-official-1',
    name: 'Emily Johnson',
    email: 'emily.johnson@example.com',
    phone: '(403) 555-0300',
    certification_level: 'Level 2',
    rank: 3,
    status: 'active',
    role: 'official',
    address: '789 Pine Road',
    city: 'Example City',
    province: 'AB',
    postal_code: 'T3A 0B7',
    emergency_contact_name: 'Michael Johnson',
    emergency_contact_phone: '(403) 555-0301',
    notes: 'New official, joined this season.',
    created_at: '2024-02-01T08:00:00Z',
    updated_at: '2024-02-01T08:00:00Z'
  },
  {
    id: 'mock-member-4',
    netlify_user_id: 'user-official-2',
    name: 'Robert Williams',
    email: 'robert.williams@example.com',
    phone: '(403) 555-0400',
    certification_level: 'Level 5',
    rank: 10,
    status: 'active',
    role: 'official',
    address: '321 Maple Drive',
    city: 'Example City',
    province: 'AB',
    postal_code: 'T2S 1A2',
    emergency_contact_name: 'Linda Williams',
    emergency_contact_phone: '(403) 555-0401',
    notes: 'Senior official with 10+ years experience.',
    created_at: '2023-09-01T08:00:00Z',
    updated_at: '2023-09-01T08:00:00Z'
  },
  {
    id: 'mock-member-5',
    netlify_user_id: 'user-official-3',
    name: 'Sarah Davis',
    email: 'sarah.davis@example.com',
    phone: '(403) 555-0500',
    certification_level: 'Level 1',
    rank: 1,
    status: 'inactive',
    role: 'official',
    address: '654 Birch Lane',
    city: 'Example City',
    province: 'AB',
    postal_code: 'T2R 0J3',
    emergency_contact_name: 'Tom Davis',
    emergency_contact_phone: '(403) 555-0501',
    notes: 'On leave for personal reasons.',
    created_at: '2024-01-20T08:00:00Z',
    updated_at: '2024-03-15T08:00:00Z'
  }
]

// Mock activities
export const mockActivities: MockActivity[] = [
  {
    id: 'mock-activity-1',
    member_id: 'mock-member-1',
    activity_type: 'meeting',
    activity_date: '2024-11-01',
    notes: 'Attended monthly executive meeting',
    created_at: '2024-11-01T19:00:00Z'
  },
  {
    id: 'mock-activity-2',
    member_id: 'mock-member-1',
    activity_type: 'training',
    activity_date: '2024-11-08',
    notes: 'Completed Level 3 certification clinic',
    created_at: '2024-11-08T18:00:00Z'
  },
  {
    id: 'mock-activity-3',
    member_id: 'mock-member-1',
    activity_type: 'game',
    activity_date: '2024-11-15',
    activity_data: { opponent: 'Team A vs Team B', level: 'U15' },
    notes: 'Officiated U15 game',
    created_at: '2024-11-15T19:30:00Z'
  },
  {
    id: 'mock-activity-4',
    member_id: 'mock-member-2',
    activity_type: 'meeting',
    activity_date: '2024-11-01',
    notes: 'Attended monthly executive meeting',
    created_at: '2024-11-01T19:00:00Z'
  },
  {
    id: 'mock-activity-5',
    member_id: 'mock-member-3',
    activity_type: 'training',
    activity_date: '2024-10-25',
    notes: 'Completed intro to officiating workshop',
    created_at: '2024-10-25T18:00:00Z'
  },
  {
    id: 'mock-activity-6',
    member_id: 'mock-member-4',
    activity_type: 'certification',
    activity_date: '2024-09-15',
    notes: 'Renewed Level 5 certification',
    created_at: '2024-09-15T14:00:00Z'
  }
]

// Helper to get member by netlify_user_id
export function getMemberByNetlifyId(netlifyUserId: string): MockMember | null {
  return mockMembers.find(m => m.netlify_user_id === netlifyUserId) || null
}

// Helper to get member by id
export function getMemberById(id: string): MockMember | null {
  return mockMembers.find(m => m.id === id) || null
}

// Helper to get activities for a member
export function getActivitiesByMemberId(memberId: string): MockActivity[] {
  return mockActivities.filter(a => a.member_id === memberId)
}

// Helper to create a new member (in-memory only)
let mockMemberCounter = mockMembers.length + 1
export function createMockMember(memberData: Partial<MockMember>): MockMember {
  const newMember: MockMember = {
    id: `mock-member-${mockMemberCounter++}`,
    netlify_user_id: memberData.netlify_user_id || '',
    name: memberData.name || '',
    email: memberData.email || '',
    phone: memberData.phone,
    certification_level: memberData.certification_level,
    rank: memberData.rank,
    status: memberData.status || 'active',
    role: memberData.role || 'official',
    address: memberData.address,
    city: memberData.city,
    province: memberData.province,
    postal_code: memberData.postal_code,
    emergency_contact_name: memberData.emergency_contact_name,
    emergency_contact_phone: memberData.emergency_contact_phone,
    custom_fields: memberData.custom_fields,
    notes: memberData.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  mockMembers.push(newMember)
  return newMember
}

// Helper to update a member (in-memory only)
export function updateMockMember(id: string, updates: Partial<MockMember>): MockMember | null {
  const index = mockMembers.findIndex(m => m.id === id)
  if (index === -1) return null

  mockMembers[index] = {
    ...mockMembers[index],
    ...updates,
    id, // Ensure ID doesn't change
    updated_at: new Date().toISOString()
  }
  return mockMembers[index]
}

// Helper to delete a member (in-memory only)
export function deleteMockMember(id: string): boolean {
  const index = mockMembers.findIndex(m => m.id === id)
  if (index === -1) return false

  mockMembers.splice(index, 1)
  // Also delete associated activities
  const activityIndices = mockActivities
    .map((a, i) => a.member_id === id ? i : -1)
    .filter(i => i !== -1)
    .reverse()
  activityIndices.forEach(i => mockActivities.splice(i, 1))

  return true
}

// Helper to update an activity (in-memory only)
export function updateMockActivity(id: string, updates: Partial<MockActivity>): MockActivity | null {
  const index = mockActivities.findIndex(a => a.id === id)
  if (index === -1) return null

  mockActivities[index] = {
    ...mockActivities[index],
    ...updates,
    id // Ensure ID doesn't change
  }
  return mockActivities[index]
}

// Helper to delete an activity (in-memory only)
export function deleteMockActivity(id: string): boolean {
  const index = mockActivities.findIndex(a => a.id === id)
  if (index === -1) return false

  mockActivities.splice(index, 1)
  return true
}
