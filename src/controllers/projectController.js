const mongoose = require("mongoose");
const catchAsync = require("../utils/catchAsync");

const Project = require("./../models/projectModel");
const Template = require("./../models/templateModel");
const Permission = require("./../models/permissionModel");
const Collaborator = require("./../models/collaboratorModel");
const Location = require("./../models/locationModel");

const AppError = require("../utils/appError");

/**
 * @desc check wheather input id is valid mongodb objectID
 * @param {String} id that want to check
 * @return {Boolean} return true if inpur is valid mongodb;otherwise false
 */
const isValidObjectId = (id) => {
  if (mongoose.isValidObjectId(id)) return true;
  return false;
};

const compareId = (id1, id2) => {
  return id1.toString() === id2.toString();
};

exports.getProjects = catchAsync(async (req, res, next) => {
  // Query project that matching requirement
  const match = {
    "project.isDeleted": false,
    "project.isArchived": false,
  };

  // Search Query
  if (req.query.searchQuery) {
    match["project.name"] = {
      $regex: `${req.query.searchQuery}`,
      $options: "i",
    };
  }
  // SortBy Quert
  const sort = {};
  if (req.query.sortBy === "ascending") {
    sort["name"] = 1;
  } else if (req.query.sortBy === "descending") {
    sort["name"] = -1;
  } else if (req.query.sortBy === "newest") {
    sort["createdAt"] = -1;
  } else if (req.query.sortBy === "oldest") {
    sort["createdAt"] = 1;
  } else if (req.query.sortBy)
    return next(new AppError("Wrong sortBy query", 401));

  const collaboratorProject = await Collaborator.aggregate([
    {
      $match: { userId: new mongoose.Types.ObjectId(req.user._id) },
    },
    {
      $group: {
        _id: "$projectId",
      },
    },
    {
      $lookup: {
        from: "projects",
        localField: "_id",
        foreignField: "_id",
        as: "project",
      },
    },
    {
      $unwind: "$project",
    },
    {
      $match: match,
    },
    {
      $lookup: {
        from: "users",
        localField: "project.owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $unwind: "$owner",
    },
    {
      $lookup: {
        from: "locations",
        localField: "project.location",
        foreignField: "_id",
        as: "location",
      },
    },
    {
      $unwind: "$location",
    },
    {
      $project: {
        _id: 0,
        id: "$project._id",
        name: "$project.name",
        owner: "$owner.name",
        location: "$location.th_name",
        startedAt: "$project.startedAt",
        createdAt: "$project.createdAt",
      },
    },
    {
      $sort: sort,
    },
    {
      $project: {
        createdAt: 0,
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    data: collaboratorProject,
  });
});

exports.createProject = catchAsync(async (req, res, next) => {
  const project = req.body;
  // Check all input requirement
  if (
    !project.name ||
    !project.template ||
    !project.location ||
    !isValidObjectId(project.template) ||
    !isValidObjectId(project.location)
  )
    return next(
      new AppError(
        "Please input all required input for creating new project.",
        401
      )
    );

  const testTemplate = await Template.findById(project.template);
  if (!testTemplate) return next(new AppError("Template not exist", 401));

  const testLocation = await Location.findById(project.location);
  if (!testLocation) return next(new AppError("Locatio not found", 401));

  // Create new project
  const newProject = await Project.create({
    owner: req.user._id,
    startedAt: new Date(req.body.startedAt) || Date.now(),
    createdAt: Date.now(),
    editedAt: Date.now(),
    editedBy: req.user._id,
    ...project,
  });

  // Add owner to collaborator
  const permission = await Permission.findOne({ name: "owner" });
  const newCollaborator = await Collaborator.create({
    userId: req.user._id,
    permissionId: permission._id,
    projectId: newProject._id,
    createdAt: Date.now(),
    createdBy: req.user._id,
    editedAt: Date.now(),
    editedBy: req.user._id,
  });

  res.status(201).json();
});

exports.getInfo = catchAsync(async (req, res, next) => {
  // Check ว่า userid มีสิทธิได้ getinfo รึป่าว
  if (!isValidObjectId(req.params.projectId))
    return next(new AppError("Invalid projectId"));
  const collaboratorProject = await Collaborator.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.user._id),
        projectId: new mongoose.Types.ObjectId(req.params.projectId),
      },
    },
    {
      $group: {
        _id: "$projectId",
      },
    },
    {
      $lookup: {
        from: "projects",
        localField: "_id",
        foreignField: "_id",
        as: "project",
      },
    },
    {
      $unwind: "$project",
    },
    {
      $lookup: {
        from: "users",
        localField: "project.owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $unwind: "$owner",
    },
    {
      $lookup: {
        from: "locations",
        localField: "project.location",
        foreignField: "_id",
        as: "location",
      },
    },
    {
      $unwind: "$location",
    },
    {
      $project: {
        _id: 0,
        name: "$project.name",
        description: "$project.description",
        ownerName: "$owner.name",
        location: "$location.th_name",
        startedAt: "$project.startedAt",
        endedAt: "$project.endedAt",
        isArchived: "$project.isArchived",
      },
    },
  ]);
  if (collaboratorProject.length === 0)
    return next(
      new AppError("You do not have permission to access this project", 401)
    );

  res.status(200).json({
    status: "success",
    data: collaboratorProject[0],
  });
});

exports.archived = catchAsync(async (req, res, next) => {
  if (!isValidObjectId(req.params.projectId))
    return next(new AppError("Invalid projectId"));

  const projectCollab = await Collaborator.findOne({
    projectId: req.params.projectId,
    userId: req.user._id,
  });

  if (!projectCollab)
    return next(
      new AppError("You do not have permission to access this project", 401)
    );

  const can_edit = await Permission.findOne({ name: "can_edited" });
  const owner = await Permission.findOne({ name: "owner" });
  if (
    !compareId(projectCollab.permissionId, can_edit._id) &&
    !compareId(projectCollab.permissionId, owner._id)
  )
    return next(
      new AppError("You do not have permission to archive project", 401)
    );

  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: req.params.projectId,
    },
    {
      isArchived: req.body.isArchived,
    }
  );
  res.status(204).json();
});

exports.deleted = catchAsync(async (req, res, next) => {
  if (!isValidObjectId(req.params.projectId))
    return next(new AppError("Invalid projectId"));

  const projectCollab = await Collaborator.findOne({
    projectId: req.params.projectId,
    userId: req.user._id,
  });

  if (!projectCollab)
    return next(
      new AppError("You do not have permission to access this project", 401)
    );
  const owner = await Permission.findOne({ name: "owner" });
  if (!compareId(projectCollab.permissionId, owner._id))
    return next(
      new AppError("You do not have permission to delete project", 401)
    );

  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: req.params.projectId,
    },
    {
      isDeleted: req.body.isDeleted,
    }
  );
  res.status(204).json();
});

exports.edited = catchAsync(async (req, res, next) => {
  if (!isValidObjectId(req.params.projectId))
    return next(new AppError("Invalid projectId"));

  const projectCollab = await Collaborator.findOne({
    projectId: req.params.projectId,
    userId: req.user._id,
  });

  if (!projectCollab)
    return next(
      new AppError("You do not have permission to access this project", 401)
    );

  const can_edit = await Permission.findOne({ name: "can_edited" });
  const owner = await Permission.findOne({ name: "owner" });
  if (
    !compareId(projectCollab.permissionId, can_edit._id) &&
    !compareId(projectCollab.permissionId, owner._id)
  )
    return next(
      new AppError("You do not have permission to edit project", 401)
    );
  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: req.params.projectId,
    },
    { editedAt: Date.now(), editedBy: req.user._id, ...req.body }
  );
  res.status(204).json();
});
