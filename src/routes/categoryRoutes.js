const express = require("express");

const authController = require("./../controllers/authController");
const categoryController = require("./../controllers/categoryController");

const router = express.Router();

router.get(
  "/:categoryId",
  authController.protect,
  categoryController.getCategoryEntry
);

router.post(
  "/:categoryId/entry",
  authController.protect,
  categoryController.createEntry
);

router.put(
  "/:categoryId",
  authController.protect,
  categoryController.editCategory
);

router.delete(
  "/:categoryId",
  authController.protect,
  categoryController.deleteCategory
);

router.get(
  "/:categoryId/entry",
  authController.protect,
  categoryController.getCategoryMainAttribute
);

router.get(
  "/:projectId/allEntry",
  authController.protect,
  categoryController.getAllEntry
);
module.exports = router;
