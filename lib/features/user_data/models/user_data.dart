import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

part 'user_data.g.dart';

@JsonSerializable(
  explicitToJson: true,
  fieldRename: FieldRename.snake,
)
class UserData extends Equatable {
  const UserData({
    required this.uuid,
    required this.userName,
    this.telegramUserName,
    required this.name,
    this.address,
    this.phoneNumber,
    required this.email,
    required this.lastName,
    required this.bio,
    required this.logo,
    required this.balance,
    required this.kyc,
    required this.totalIn,
    required this.totalOut,
    required this.latestTransactions,
  });

  factory UserData.fromMe(Me me) {
    return UserData(
      uuid: me.uuid,
      userName: me.username,
      telegramUserName: '',
      name: me.name,
      address: '',
      phoneNumber: '',
      email: me.email,
      lastName: me.lastname ?? '',
      bio: me.bio ?? '',
      logo: me.logo ?? '',
      balance: me.balance ?? '0.0',
      kyc: me.kyc ?? 0,
      totalIn: me.totalIn ?? '0.0',
      totalOut: me.totalOut ?? '0.0',
      latestTransactions: me.latestTransactions
              ?.map((e) => UserTransaction.fromTransaction(e))
              .toList() ??
          <UserTransaction>[],
    );
  }

  factory UserData.fromJson(Map<String, dynamic> json) =>
      _$UserDataFromJson(json);
  Map<String, dynamic> toJson() => _$UserDataToJson(this);

  final String uuid;
  @JsonKey(name: 'username')
  final String userName;
  final String? telegramUserName;
  final String? address;
  final String? phoneNumber;
  final String name;
  final String email;
  @JsonKey(name: 'lastname')
  final String lastName;
  final String bio;
  final String logo;
  final String balance;
  final int kyc;
  final String totalIn;
  final String totalOut;
  @JsonKey(name: 'latestTransactions')
  final List<UserTransaction> latestTransactions;

  String get nameAndLastName {
    var userName = '';
    if (lastName.isEmpty) {
      userName = name;
    } else {
      userName = '$name $lastName';
    }
    return userName;
  }

  @override
  List<Object?> get props {
    return [
      uuid,
      userName,
      name,
      email,
      telegramUserName,
      address,
      phoneNumber,
      lastName,
      bio,
      logo,
      balance,
      kyc,
      totalIn,
      totalOut,
      latestTransactions,
    ];
  }

  UserData copyWith({
    String? uuid,
    String? userName,
    String? telegramUserName,
    String? address,
    String? phoneNumber,
    String? name,
    String? email,
    String? lastName,
    String? bio,
    String? logo,
    String? balance,
    int? kyc,
    String? totalIn,
    String? totalOut,
    List<UserTransaction>? latestTransactions,
  }) {
    return UserData(
      uuid: uuid ?? this.uuid,
      userName: userName ?? this.userName,
      telegramUserName: telegramUserName ?? this.telegramUserName,
      address: address ?? this.address,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      name: name ?? this.name,
      email: email ?? this.email,
      lastName: lastName ?? this.lastName,
      bio: bio ?? this.bio,
      logo: logo ?? this.logo,
      balance: balance ?? this.balance,
      kyc: kyc ?? this.kyc,
      totalIn: totalIn ?? this.totalIn,
      totalOut: totalOut ?? this.totalOut,
      latestTransactions: latestTransactions ?? this.latestTransactions,
    );
  }
}
