const express = require('express');
const router = express.Router();
const Institution = require('../models/Institution');

// GET /api/institutions — list all active institutions (public, used during signup)
router.get('/', async (req, res) => {
  try {
    const institutions = await Institution.find({ isActive: true })
      .select('name code province type')
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      institutions: institutions.map((i) => ({
        id: i._id,
        name: i.name,
        code: i.code,
        province: i.province,
        type: i.type,
      })),
    });
  } catch (error) {
    console.error('Get institutions error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/institutions/validate-code — validate an institution code
router.post('/validate-code', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Institution code is required.' });
    }

    const institution = await Institution.findOne({
      code: code.toUpperCase().trim(),
      isActive: true,
    }).select('name code province type');

    if (!institution) {
      return res.status(404).json({ success: false, message: 'Invalid institution code. Please check and try again.' });
    }

    return res.status(200).json({
      success: true,
      institution: {
        id: institution._id,
        name: institution.name,
        code: institution.code,
        province: institution.province,
        type: institution.type,
      },
    });
  } catch (error) {
    console.error('Validate institution code error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
