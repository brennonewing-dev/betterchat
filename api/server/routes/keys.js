const express = require('express');
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('~/models');
const { getLiteLLMBudgetStatus } = require('~/server/services/AuthService');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.put('/', requireJwtAuth, async (req, res) => {
  await updateUserKey({ userId: req.user.id, ...req.body });
  res.status(201).send();
});

router.delete('/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', requireJwtAuth, async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

/**
 * GET /keys/budget
 * Get the user's LiteLLM budget status
 * Returns: { maxBudget, usedBudget, remainingBudget, budgetDuration, budgetResetAt, ... }
 */
router.get('/budget', requireJwtAuth, async (req, res) => {
  try {
    const result = await getLiteLLMBudgetStatus(req.user.id);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.status(200).json(result.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get budget status' });
  }
});

module.exports = router;
