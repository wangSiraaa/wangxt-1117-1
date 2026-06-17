import request from '../utils/request';

export const getPonds = () => request.get('/ponds');
export const getPondDetail = (id) => request.get(`/ponds/${id}`);
export const addPond = (data) => request.post('/ponds', data);
export const updatePond = (id, data) => request.put(`/ponds/${id}`, data);
export const lockPond = (id, data) => request.post(`/ponds/${id}/lock`, data);
export const unlockPond = (id, data) => request.post(`/ponds/${id}/unlock`, data);
export const getPondUnlockCheck = (id) => request.get(`/ponds/${id}/unlock-check`);
export const getPondTimeline = (id) => request.get(`/ponds/${id}/timeline`);
export const getPondLockRecords = (id) => request.get(`/ponds/${id}/lock-records`);

export const getDrugs = (includeBanned = false) =>
  request.get('/drugs', { params: { include_banned: includeBanned } });
export const getDrugSubstitutes = (id) => request.get(`/drugs/${id}/substitutes`);
export const addDrug = (data) => request.post('/drugs', data);

export const getMedications = (params) => request.get('/medications', { params });
export const addMedication = (data) => request.post('/medications', data);
export const auditMedication = (id, data) => request.post(`/medications/${id}/audit`, data);
export const resubmitMedication = (id, data) => request.post(`/medications/${id}/resubmit`, data);

export const getInspections = (params) => request.get('/inspections', { params });
export const addInspection = (data) => request.post('/inspections', data);

export const getHarvests = () => request.get('/harvests');
export const addHarvest = (data) => request.post('/harvests', data);
export const updateHarvestStatus = (id, status) =>
  request.put(`/harvests/${id}/status`, { status });
export const recalculateHarvest = (id, data) =>
  request.post(`/harvests/${id}/recalculate`, data || {});

export const getAudits = () => request.get('/medications');

export const getSummary = () => request.get('/statistics/summary');
