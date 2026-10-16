import Transaction from "./transaction.model.js";

class PaymentRepository {
    async createTransaction(data) {
        return Transaction.create(data);
    }

    async findByOrderId(orderId) {
        return Transaction.findOne({ orderId });
    }

    async updateTransaction(orderId, updateData, session = null) {
        return Transaction.findOneAndUpdate({ orderId }, updateData, { new: true, session });
    }
}

export default new PaymentRepository();