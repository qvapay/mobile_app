import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart' show Transaction;

part 'user_transaction.g.dart';

enum TransactionType { transfer, p2p, service, autoRecharge, unknown }

@JsonSerializable(
  explicitToJson: true,
  fieldRename: FieldRename.snake,
  includeIfNull: false,
)
class UserTransaction extends Equatable {
  const UserTransaction({
    required this.uuid,
    required this.amount,
    required this.description,
    this.email,
    required this.name,
    required this.date,
    required this.imageUrl,
    required this.transactionType,
  });

  factory UserTransaction.fromJson(Map<String, dynamic> json) =>
      _$UserTransactionFromJson(json);

  factory UserTransaction.fromTransaction(Transaction transaction) {
    var transactionType = TransactionType.unknown;
    var name = '';

    void changeToLongName(Transaction transaction) {
      final lastName = transaction.owner!.lastname;
      name = '${transaction.owner!.name}'
          '${lastName != null ? '' : ' '}${lastName ?? ''}';
    }

    if (transaction.serviceBuy == null &&
        transaction.wallet == null &&
        transaction.payTo == null &&
        transaction.app != null &&
        transaction.paidBy != null &&
        transaction.owner != null) {
      transactionType = TransactionType.transfer;
      changeToLongName(transaction);
    } else if (transaction.serviceBuy != null &&
        transaction.wallet == null &&
        transaction.owner != null) {
      transactionType = TransactionType.service;
      changeToLongName(transaction);
    } else if (transaction.serviceBuy == null &&
        transaction.wallet == null &&
        transaction.app == null &&
        transaction.appOwner == null &&
        transaction.paidBy == null &&
        transaction.owner != null) {
      transactionType = TransactionType.p2p;
      changeToLongName(transaction);
    } else if (transaction.serviceBuy == null &&
        transaction.app != null &&
        transaction.wallet != null &&
        transaction.owner != null) {
      transactionType = TransactionType.autoRecharge;
      changeToLongName(transaction);
    }

    return UserTransaction(
      uuid: transaction.uuid,
      name: name,
      amount: transaction.amount,
      description: transaction.description,
      imageUrl: transaction.logo ?? '',
      date: transaction.updatedAt,
      transactionType: transactionType,
    );
  }

  final String uuid;
  final String name;
  final String? email;
  final String amount;
  final String description;
  final String imageUrl;
  final DateTime date;
  final TransactionType transactionType;

  Map<String, dynamic> toJson() => _$UserTransactionToJson(this);

  @override
  List<Object?> get props {
    return [
      uuid,
      amount,
      description,
      email,
      name,
      date,
      imageUrl,
      transactionType,
    ];
  }
}
