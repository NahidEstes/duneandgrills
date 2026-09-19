import MenuAddOn from "../models/MenuAddOn.js";
import { pickAuditFields, recordAuditLog } from "../services/auditLogService.js";
import { validateMenuAddOnPayload } from "../services/menuCustomizationService.js";

const AUDIT_FIELDS = ["name", "price", "image", "isActive", "menuItems"];

export const listMenuAddOns = async (req, res, next) => {
  try {
    const rows = await MenuAddOn.find()
      .populate("menuItems", "name category isAvailable")
      .sort({ updatedAt: -1 });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
};

export const createMenuAddOn = async (req, res, next) => {
  try {
    const addOn = await MenuAddOn.create(await validateMenuAddOnPayload(req.body));
    await recordAuditLog({
      actor: req.user,
      action: "MENU_ADD_ON_CREATED",
      entityType: "MenuAddOn",
      entityId: addOn._id,
      entityLabel: addOn.name,
      after: pickAuditFields(addOn, AUDIT_FIELDS),
    });
    await addOn.populate("menuItems", "name category isAvailable");
    res.status(201).json({ success: true, data: addOn });
  } catch (error) {
    next(error);
  }
};

export const updateMenuAddOn = async (req, res, next) => {
  try {
    const addOn = await MenuAddOn.findById(req.params.addOnId);
    if (!addOn) return res.status(404).json({ success: false, message: "Add-on not found" });
    const before = pickAuditFields(addOn, AUDIT_FIELDS);
    addOn.set(await validateMenuAddOnPayload(req.body));
    await addOn.save();
    await recordAuditLog({
      actor: req.user,
      action: "MENU_ADD_ON_UPDATED",
      entityType: "MenuAddOn",
      entityId: addOn._id,
      entityLabel: addOn.name,
      before,
      after: pickAuditFields(addOn, AUDIT_FIELDS),
    });
    await addOn.populate("menuItems", "name category isAvailable");
    res.json({ success: true, data: addOn });
  } catch (error) {
    next(error);
  }
};

export const deleteMenuAddOn = async (req, res, next) => {
  try {
    const addOn = await MenuAddOn.findById(req.params.addOnId);
    if (!addOn) return res.status(404).json({ success: false, message: "Add-on not found" });
    await MenuAddOn.deleteOne({ _id: addOn._id });
    await recordAuditLog({
      actor: req.user,
      action: "MENU_ADD_ON_DELETED",
      entityType: "MenuAddOn",
      entityId: addOn._id,
      entityLabel: addOn.name,
      before: pickAuditFields(addOn, AUDIT_FIELDS),
    });
    res.json({ success: true, message: "Add-on deleted" });
  } catch (error) {
    next(error);
  }
};

