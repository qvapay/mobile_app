import 'dart:convert';

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

  factory UserTransaction.decode(String transaction) =>
      _$UserTransactionFromJson(
          json.decode(utf8.decode(base64.decode(transaction)))
              as Map<String, dynamic>);

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
      email: transaction.owner?.email ?? '',
      amount: transaction.amount,
      description: transaction.description,
      imageUrl: transaction.owner?.logo ?? '',
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

  String encode() => base64.encode(utf8.encode(json.encode(toJson())));

  String get smallUuid => uuid.split('-')[4];

  bool get isSend {
    try {
      return double.parse(amount) < 0;
    } catch (_) {
      return false;
    }
  }

  bool get isReceive {
    try {
      return double.parse(amount) > 0;
    } catch (_) {
      return false;
    }
  }

  String get typeToString {
    if (transactionType == TransactionType.autoRecharge) {
      return 'Auto Recarga';
    } else if (transactionType == TransactionType.p2p) {
      return 'P2P';
    } else if (transactionType == TransactionType.service) {
      return 'Servicio';
    } else if (transactionType == TransactionType.transfer) {
      return 'Tranferencia';
    }

    return 'Unknown';
  }

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

  UserTransaction copyWith({
    String? uuid,
    String? name,
    String? email,
    String? amount,
    String? description,
    String? imageUrl,
    DateTime? date,
    TransactionType? transactionType,
  }) {
    return UserTransaction(
      uuid: uuid ?? this.uuid,
      name: name ?? this.name,
      email: email ?? this.email,
      amount: amount ?? this.amount,
      description: description ?? this.description,
      imageUrl: imageUrl ?? this.imageUrl,
      date: date ?? this.date,
      transactionType: transactionType ?? this.transactionType,
    );
  }
}
