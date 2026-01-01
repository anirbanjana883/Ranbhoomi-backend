export const PLANS = {
  Free: {
    price: 0,
    aiLimit: 3, 
    canHostContest: false,
    mockInterviews: 1, 
    accessCompanyTags: false,
  },
  Warrior: {
    price: 49900, 
    aiLimit: 1000, 
    canHostContest: false,
    mockInterviews: 5,
    accessCompanyTags: true,
  },
  Gladiator: {
    price: 99900, 
    aiLimit: 10000, 
    canHostContest: true, 
    mockInterviews: 100, 
    accessCompanyTags: true,
  },
};