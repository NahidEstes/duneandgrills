import {
  createCustomerNote,
  deleteCustomerNote,
  getCustomerOverview,
  listCustomerDirectory,
  listCustomerFavouriteItems,
  listCustomerNotes,
  listCustomerOrders,
  listCustomerRewardHistory,
  updateCustomerNote,
} from "../services/customerCrmService.js";

const respond = (res, data, status = 200) => res.status(status).json({ success: true, ...data });

export const getCustomers = async (req, res, next) => {
  try {
    respond(res, await listCustomerDirectory(req.query));
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req, res, next) => {
  try {
    respond(res, { data: await getCustomerOverview(req.params.customerId) });
  } catch (error) {
    next(error);
  }
};

export const getCustomerOrders = async (req, res, next) => {
  try {
    respond(res, await listCustomerOrders(req.params.customerId, req.query));
  } catch (error) {
    next(error);
  }
};

export const getCustomerFavourites = async (req, res, next) => {
  try {
    respond(res, { data: await listCustomerFavouriteItems(req.params.customerId) });
  } catch (error) {
    next(error);
  }
};

export const getCustomerRewards = async (req, res, next) => {
  try {
    respond(res, await listCustomerRewardHistory(req.params.customerId, req.query));
  } catch (error) {
    next(error);
  }
};

export const getCustomerNotes = async (req, res, next) => {
  try {
    respond(res, { data: await listCustomerNotes(req.params.customerId) });
  } catch (error) {
    next(error);
  }
};

export const postCustomerNote = async (req, res, next) => {
  try {
    const note = await createCustomerNote({
      customerId: req.params.customerId,
      text: req.body.text,
      actor: req.user,
    });
    respond(res, { data: note }, 201);
  } catch (error) {
    next(error);
  }
};

export const patchCustomerNote = async (req, res, next) => {
  try {
    const note = await updateCustomerNote({
      customerId: req.params.customerId,
      noteId: req.params.noteId,
      text: req.body.text,
      actor: req.user,
    });
    respond(res, { data: note });
  } catch (error) {
    next(error);
  }
};

export const removeCustomerNote = async (req, res, next) => {
  try {
    respond(res, { data: await deleteCustomerNote({
      customerId: req.params.customerId,
      noteId: req.params.noteId,
      actor: req.user,
    }) });
  } catch (error) {
    next(error);
  }
};
