import express from 'express';
import { insertInternalOrgData } from '../controllers/internalController.js';
import {
  getCompanyData,
  getTruesightCompanyData,
  getTruesightCompanyData2,
  getOrbisCompanyData,
  getOrbisGridData,
  getGridData,
  getGridDataPersonnels,
  getGridDataOrganizationWithId,
  getGridDataPersonnelWithId,
  getOrbisNews
} from '../controllers/orbisController.js';
import {
  validateOrg,
  validatePayload,
  validatePayload1,
  validateId,
  validateGrid,
  validateGridPersonnel
} from '../middlewares/inputValidator.js';
import { rateLimitMiddleware } from '../middlewares/rateLimiter.js';
import { getCurrentUser } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/data', validateOrg, rateLimitMiddleware, insertInternalOrgData);
router.get(
  '/match/companies',
  getCurrentUser,
  validatePayload,
  rateLimitMiddleware,
  getCompanyData,
); //old [Don't use]

// For verifying and getting suggested companies list from orbis {For verification : Trusight}
router.get(
  '/truesight/companies', 
  getCurrentUser,
  validatePayload,
  rateLimitMiddleware,
  getTruesightCompanyData,
); //New, In-use

router.get(
  '/truesight/newcompanies',
  getCurrentUser,
  validatePayload1,
  rateLimitMiddleware,
  getTruesightCompanyData2,
);

// For getting the exact company data and storing it into db[Logic : Retrieving the info]
router.get('/companies', getCurrentUser, rateLimitMiddleware, getOrbisCompanyData); //In-use

// For getting news from orbis
router.get('/news', getCurrentUser, validateId, rateLimitMiddleware, getOrbisNews); //In-use

// For getting the grid info from orbis[grid] for Companies 
router.get('/orbisgrid/companies', getCurrentUser, validateId, rateLimitMiddleware, getOrbisGridData);

// For getting the grid info from gridendpoint for Comany [From Management Grid] 
router.get('/grid/companies', getCurrentUser, validateGrid, getGridData)

// For getting the grid info from gridendpoint for Person [From Management Grid] [using table : grid_management for saving management data]
router.get('/grid/personnels',getCurrentUser, validateGridPersonnel, rateLimitMiddleware, getGridDataPersonnels);

// For getting grid info for unique\ Company by using bvdId []
router.get('/grid/id/companies', getCurrentUser, validateId, rateLimitMiddleware, getGridDataOrganizationWithId);

// For getting grid info for unique Person by using contactId [using table : management for saving management data]
router.get('/grid/id/personnels', getCurrentUser, validateId, rateLimitMiddleware, getGridDataPersonnelWithId);

export default router;
